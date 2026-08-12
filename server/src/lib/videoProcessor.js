/**
 * videoProcessor.js — Server-side video compression + thumbnail generation.
 * Uses ffmpeg-static binary directly via child_process.spawn (no fluent-ffmpeg).
 * compressVideo(buffer) → { videoBuffer, thumbBuffer }
 */

import { spawn } from 'child_process';
import ffmpegBin from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';

const log = logger('videoProcessor');

// ffmpeg-static returns the binary path; fall back to PATH if somehow null
const FFMPEG = ffmpegBin || 'ffmpeg';

function tmpPath(ext) {
  return path.join(tmpdir(), `olive_${crypto.randomBytes(8).toString('hex')}.${ext}`);
}

/**
 * Run an ffmpeg command and resolve/reject based on exit code.
 * @param {string[]} args - ffmpeg arguments (not including the binary itself)
 * @param {string}   label - short description for logging
 */
function runFfmpeg(args, label) {
  return new Promise((resolve, reject) => {
    log.info(`ffmpeg ${label} start`, { args: args.join(' ') });
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const stderr = [];
    proc.stderr.on('data', chunk => stderr.push(chunk));

    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        const msg = Buffer.concat(stderr).toString('utf8').slice(-800);
        reject(new Error(`ffmpeg ${label} exited ${code}: ${msg}`));
      }
    });

    proc.on('error', err => reject(new Error(`ffmpeg ${label} spawn error: ${err.message}`)));
  });
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
    await runFfmpeg([
      '-i', inputPath,
      '-vf', "scale='min(1280,iw)':'-2',scale='-2:min(720,ih)'",
      '-vcodec', 'libx264',
      '-crf', '28',
      '-preset', 'fast',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-acodec', 'aac',
      '-b:a', '128k',
      '-f', 'mp4',
      '-y', outputPath,
    ], 'compress');

    // ── Thumbnail at 1 second (fallback to 0 if video is shorter) ────────────
    try {
      await runFfmpeg([
        '-ss', '1',
        '-i', inputPath,
        '-vframes', '1',
        '-y', thumbPath,
      ], 'thumbnail@1s');
    } catch {
      await runFfmpeg([
        '-ss', '0',
        '-i', inputPath,
        '-vframes', '1',
        '-y', thumbPath,
      ], 'thumbnail@0s');
    }

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
