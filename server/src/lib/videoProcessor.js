/**
 * videoProcessor.js — Server-side video compression + thumbnail generation.
 * Uses fluent-ffmpeg + ffmpeg-static (already installed).
 * compressVideo(buffer) → { videoBuffer, thumbBuffer }
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';

const log = logger('videoProcessor');

ffmpeg.setFfmpegPath(ffmpegStatic);

function tmpPath(ext) {
  return path.join(tmpdir(), `olive_${crypto.randomBytes(8).toString('hex')}.${ext}`);
}

// ── Concurrency guard ────────────────────────────────────────────────────────
// Limit simultaneous ffmpeg processes so we don't exhaust /tmp disk space or
// CPU on the host under concurrent upload spikes.
const MAX_CONCURRENT = 2;
let _activeCompressions = 0;

/**
 * Compress a video buffer to H.264 MP4 (720p, CRF-28) and generate a JPEG
 * thumbnail at the 1-second mark.
 *
 * @param {Buffer} buffer - raw video bytes
 * @returns {{ videoBuffer: Buffer, thumbBuffer: Buffer }}
 * @throws if the compression queue is full or ffmpeg fails
 */
export async function compressVideo(buffer) {
  if (_activeCompressions >= MAX_CONCURRENT) {
    throw new Error(
      `Video compression is busy (${_activeCompressions}/${MAX_CONCURRENT} active). ` +
      `Please retry in a few seconds.`
    );
  }
  _activeCompressions++;
  try {
    return await _doCompress(buffer);
  } finally {
    _activeCompressions--;
  }
}

async function _doCompress(buffer) {
  const inputPath  = tmpPath('mp4');
  const outputPath = tmpPath('mp4');
  const thumbPath  = tmpPath('jpg');

  await fs.writeFile(inputPath, buffer);

  try {
    // ── Compress video ───────────────────────────────────────────────────────
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        // Scale height to 720 max, keep aspect ratio; width must be even
        .videoFilter("scale='min(1280,iw)':'-2',scale='-2:min(720,ih)'")
        .outputOptions([
          '-crf 28',
          '-preset fast',
          '-movflags +faststart',
          '-pix_fmt yuv420p',
        ])
        .audioCodec('aac')
        .audioBitrate('128k')
        .format('mp4')
        .output(outputPath)
        .on('start', cmd  => log.info('ffmpeg compress start', { cmd }))
        .on('end',   ()   => resolve())
        .on('error', err  => reject(err))
        .run();
    });

    // ── Thumbnail at 1 second ────────────────────────────────────────────────
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(1)
        .frames(1)
        .output(thumbPath)
        .on('end',   ()  => resolve())
        .on('error', err => {
          // If video is shorter than 1s, try frame 0
          ffmpeg(inputPath)
            .seekInput(0)
            .frames(1)
            .output(thumbPath)
            .on('end',   () => resolve())
            .on('error', e2 => reject(e2))
            .run();
        })
        .run();
    });

    const [videoBuffer, thumbBuffer] = await Promise.all([
      fs.readFile(outputPath),
      fs.readFile(thumbPath),
    ]);

    log.info('compressVideo done', {
      inputBytes:  buffer.length,
      outputBytes: videoBuffer.length,
      thumbBytes:  thumbBuffer.length,
    });

    return { videoBuffer, thumbBuffer };
  } finally {
    await Promise.all([
      fs.unlink(inputPath).catch(() => {}),
      fs.unlink(outputPath).catch(() => {}),
      fs.unlink(thumbPath).catch(() => {}),
    ]);
  }
}
