import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import NetInfo from "@react-native-community/netinfo";
import {
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeSermon, verifyAndCorrectTranscription } from "./api";

// ─── What this can and can't do, plainly ───────────────────────────────────
// - Recording itself needs no internet at all: audio is captured straight to
//   a file on the device (expo-file-system), so you can record a sermon
//   anywhere with zero signal.
// - Recording keeps running if you minimize the app (switch apps, lock the
//   screen) — iOS/Android both allow that for an app with background audio
//   enabled, which this app declares.
// - Recording does NOT continue if you fully close/swipe the app away. No
//   app built with Expo (or almost any consumer app) can keep custom code
//   running once the OS has killed the process — that's an OS-level rule,
//   not a limitation of this feature specifically.
// - Turning the recording into text (transcription) needs a connection,
//   because it runs through a speech-to-text model on the server — fully
//   on-device transcription would require bundling a multi-hundred-MB
//   model, which would make the app slow/heavy on exactly the low-memory
//   devices we're optimizing for. If you're offline when you finish
//   recording, the clip is saved locally and queued — it transcribes
//   itself automatically the moment you're back online, even in the
//   background.
// - The recorder itself lives in RecordingContext (app root), NOT in the
//   Notes screen, specifically so navigating away from Notes/Highlights
//   never tears down the native recorder and cuts the recording short.

const QUEUE_KEY = "sermonRecorder.queue";
const recordingsDir = new Directory(Paths.document, "sermon-recordings");
const MAX_RECORDING_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours max per recording

export type SermonRecording = {
  id: string;
  localUri: string;
  createdAt: string;
  status: "queued" | "transcribing" | "done" | "failed";
  title?: string;
  formattedText?: string;
  rawText?: string;
  error?: string;
  edited?: boolean;
  durationSeconds?: number;
  verificationStatus?: "verified" | "unverified" | "corrected";
};

function ensureDir() {
  if (!recordingsDir.exists) recordingsDir.create({ intermediates: true, idempotent: true });
}

export async function loadQueue(): Promise<SermonRecording[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  const queue: SermonRecording[] = JSON.parse(raw);
  // Items left in "transcribing" at startup mean the app was killed mid-flight.
  // Reset them to "queued" so processQueue picks them up and retries.
  let needsSave = false;
  for (const item of queue) {
    if (item.status === "transcribing") {
      item.status = "queued";
      item.error = undefined;
      needsSave = true;
    }
  }
  if (needsSave) await saveQueue(queue);
  return queue;
}

export async function saveQueue(queue: SermonRecording[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// Lets the notes/highlights screen save manual edits to a transcript (add,
// remove, or rewrite any part of the recognized text) without re-recording.
export async function updateRecordingText(id: string, formattedText: string) {
  const queue = await loadQueue();
  const idx = queue.findIndex((q) => q.id === id);
  if (idx >= 0) {
    queue[idx] = { ...queue[idx], formattedText, edited: true };
    await saveQueue(queue);
  }
  return queue;
}

// On Android, isInternetReachable is almost always null or false even on a
// healthy Wi-Fi or mobile data connection — the OS does not perform a live
// reachability probe the way iOS does. Using it as a gate here would keep
// every recording permanently stuck in "Queued — waiting for connection".
// isConnected: true is the reliable signal; if the server turns out to be
// genuinely unreachable the upload fails, the error handler detects it as a
// network error, and the item is reset to "queued" and retried automatically.
function hasRealConnection(state: { isConnected: boolean | null; isInternetReachable: boolean | null }) {
  return !!state.isConnected;
}

let processing = false;

export async function processQueue(onUpdate: (queue: SermonRecording[]) => void) {
  if (processing) return;
  processing = true;
  try {
    const net = await NetInfo.fetch();
    if (!hasRealConnection(net)) return;

    let queue = await loadQueue();
    let changed = false;
    for (let i = 0; i < queue.length; i++) {
      const rec = queue[i];
      if (rec.status !== "queued") continue;
      queue[i] = { ...rec, status: "transcribing", error: undefined };
      changed = true;
      await saveQueue(queue);
      onUpdate(queue);
      try {
        const result = await transcribeSermon(rec.localUri, `sermon-${rec.id}.m4a`);
        queue = await loadQueue();
        const idx = queue.findIndex((q) => q.id === rec.id);
        if (idx >= 0) {
          queue[idx] = { 
            ...queue[idx], 
            status: "done", 
            ...result,
            verificationStatus: "unverified",
          };
          await saveQueue(queue);
          onUpdate(queue);
          
          // Async verification: runs in the background, updates when done
          // Don't await this — let it finish in background
          verifyAndCorrectTranscriptionInBackground(queue[idx], idx, onUpdate);
        }
      } catch (e: any) {
        queue = await loadQueue();
        const idx = queue.findIndex((q) => q.id === rec.id);
        if (idx >= 0) {
          const isTimeout =
            e?.name === "TimeoutError" ||
            e?.name === "AbortError" ||
            (typeof e?.message === "string" && e.message.toLowerCase().includes("timed out"));
          const isNetworkError =
            !isTimeout &&
            typeof e?.message === "string" &&
            (e.message.toLowerCase().includes("network") ||
              e.message.toLowerCase().includes("reach") ||
              e.message.toLowerCase().includes("connection"));
          const nextStatus: "queued" | "failed" = isNetworkError ? "queued" : "failed";
          queue[idx] = { ...queue[idx], status: nextStatus, error: e.message };
          await saveQueue(queue);
          onUpdate(queue);
        }
        break; // stop on first failure, retry later
      }
    }
    if (changed) onUpdate(await loadQueue());
  } finally {
    processing = false;
  }
}

// Background verification process — runs async without blocking the queue
async function verifyAndCorrectTranscriptionInBackground(
  rec: SermonRecording,
  queueIndex: number,
  onUpdate: (queue: SermonRecording[]) => void
) {
  try {
    if (!rec.rawText || !rec.id) return;
    
    const verification = await verifyAndCorrectTranscription(
      rec.localUri,
      `sermon-${rec.id}.m4a`,
      rec.rawText
    );

    const queue = await loadQueue();
    const idx = queue.findIndex((q) => q.id === rec.id);
    if (idx >= 0) {
      // Apply corrections if any were found
      queue[idx] = {
        ...queue[idx],
        rawText: verification.verifiedText,
        // Reformat with verified text
        formattedText: verification.verifiedText
          .trim()
          .replace(/\s+/g, " ")
          .replace(/([.!?])\s+(?=[A-Z])/g, "$1\n")
          .replace(/([.!?])([A-Z])/g, "$1 $2"),
        verificationStatus: verification.corrections.length > 0 ? "corrected" : "verified",
      };
      // Ensure ends with punctuation
      if (queue[idx].formattedText && !queue[idx].formattedText!.match(/[.!?]$/)) {
        queue[idx].formattedText = queue[idx].formattedText + ".";
      }
      await saveQueue(queue);
      onUpdate(queue);
    }
  } catch (err) {
    // Verification failed (network, timeout, etc.) — that's okay,
    // the transcript is already saved and usable as-is.
    console.warn("Background verification failed (non-blocking):", err);
  }
}

// The single audio-recorder + transcription-queue instance for the whole
// app. This is deliberately called ONCE, from RecordingContext at the app
// root — not from the Notes screen — so recording keeps going regardless of
// which screen the user navigates to.
export function useSermonRecordings() {
  const [recordings, setRecordings] = useState<SermonRecording[]>([]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const netUnsub = useRef<(() => void) | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const refresh = useCallback(async () => {
    setRecordings((await loadQueue()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  useEffect(() => {
    refresh();
    processQueue(setRecordings);
    // Auto-retry the moment connectivity returns — this is what lets
    // transcription finish even if the user only reconnects much later.
    netUnsub.current = NetInfo.addEventListener((state) => {
      if (hasRealConnection(state)) processQueue(setRecordings);
    });
    // Belt-and-suspenders: some devices/emulators don't fire a NetInfo
    // event reliably when connectivity flips back on, so also poll
    // periodically — this is what fixes items getting stuck showing
    // "queued, waiting for connection" even though the device is online.
    pollRef.current = setInterval(() => {
      processQueue(setRecordings);
    }, 15000);
    return () => {
      netUnsub.current?.();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const startRecording = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error("Microphone permission is required to record.");
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      // Keeps capturing if the app is backgrounded/minimized mid-recording.
      shouldPlayInBackground: true,
    });
    ensureDir();
    await recorder.prepareToRecordAsync();
    recorder.record();
    // Log start time for duration tracking
    console.log("Sermon recording started");
  }, [recorder]);

  const stopRecording = useCallback(async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return null;

    ensureDir();
    const id = `${Date.now()}`;
    const sourceFile = new File(uri);
    const destFile = new File(recordingsDir, `${id}.m4a`);
    sourceFile.copy(destFile);

    // Try to get duration from recorder state
    const durationMs = recorderState.durationMillis || 0;

    const entry: SermonRecording = {
      id,
      localUri: destFile.uri,
      createdAt: new Date().toISOString(),
      status: "queued",
      durationSeconds: Math.floor(durationMs / 1000),
      verificationStatus: "unverified",
    };
    const queue = await loadQueue();
    queue.unshift(entry);
    await saveQueue(queue);
    setRecordings(queue);
    processQueue(setRecordings);
    console.log(`Sermon recording stopped. Duration: ${entry.durationSeconds}s`);
    return entry;
  }, [recorder, recorderState.durationMillis]);

  const retry = useCallback(async (id: string) => {
    const queue = await loadQueue();
    const idx = queue.findIndex((q) => q.id === id);
    if (idx >= 0) {
      queue[idx] = { ...queue[idx], status: "queued", error: undefined };
      await saveQueue(queue);
      setRecordings(queue);
      processQueue(setRecordings);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    const queue = await loadQueue();
    const rec = queue.find((q) => q.id === id);
    if (rec) {
      try {
        new File(rec.localUri).delete();
      } catch {
        // Already gone — fine.
      }
    }
    const next = queue.filter((q) => q.id !== id);
    await saveQueue(next);
    setRecordings(next);
  }, []);

  const editText = useCallback(async (id: string, text: string) => {
    const queue = await updateRecordingText(id, text);
    setRecordings(queue);
  }, []);

  return {
    recordings,
    isRecording: recorderState.isRecording,
    durationMillis: recorderState.durationMillis,
    startRecording,
    stopRecording,
    retry,
    remove,
    editText,
  };
}
