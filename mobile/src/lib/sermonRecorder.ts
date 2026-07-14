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
import { transcribeSermon } from "./api";

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

const QUEUE_KEY = "sermonRecorder.queue";
const recordingsDir = new Directory(Paths.document, "sermon-recordings");

export type SermonRecording = {
  id: string;
  localUri: string;
  createdAt: string;
  status: "queued" | "transcribing" | "done" | "failed";
  title?: string;
  formattedText?: string;
  rawText?: string;
  error?: string;
};

function ensureDir() {
  if (!recordingsDir.exists) recordingsDir.create({ intermediates: true, idempotent: true });
}

async function loadQueue(): Promise<SermonRecording[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveQueue(queue: SermonRecording[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

let processing = false;

async function processQueue(onUpdate: (queue: SermonRecording[]) => void) {
  if (processing) return;
  processing = true;
  try {
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    let queue = await loadQueue();
    let changed = false;
    for (let i = 0; i < queue.length; i++) {
      const rec = queue[i];
      if (rec.status !== "queued") continue;
      queue[i] = { ...rec, status: "transcribing" };
      changed = true;
      await saveQueue(queue);
      onUpdate(queue);
      try {
        const result = await transcribeSermon(rec.localUri, `sermon-${rec.id}.m4a`);
        queue = await loadQueue();
        const idx = queue.findIndex((q) => q.id === rec.id);
        if (idx >= 0) {
          queue[idx] = { ...queue[idx], status: "done", ...result };
          await saveQueue(queue);
          onUpdate(queue);
        }
      } catch (e: any) {
        queue = await loadQueue();
        const idx = queue.findIndex((q) => q.id === rec.id);
        if (idx >= 0) {
          queue[idx] = { ...queue[idx], status: "queued", error: e.message };
          await saveQueue(queue);
          onUpdate(queue);
        }
        break; // stop on first failure (likely still offline/flaky), retry later
      }
    }
    if (changed) onUpdate(await loadQueue());
  } finally {
    processing = false;
  }
}

export function useSermonRecordings() {
  const [recordings, setRecordings] = useState<SermonRecording[]>([]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const netUnsub = useRef<(() => void) | undefined>(undefined);

  const refresh = useCallback(async () => {
    setRecordings((await loadQueue()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);

  useEffect(() => {
    refresh();
    processQueue(setRecordings);
    // Auto-retry the moment connectivity returns — this is what lets
    // transcription finish even if the user only reconnects much later.
    netUnsub.current = NetInfo.addEventListener((state) => {
      if (state.isConnected) processQueue(setRecordings);
    });
    return () => netUnsub.current?.();
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

    const entry: SermonRecording = {
      id,
      localUri: destFile.uri,
      createdAt: new Date().toISOString(),
      status: "queued",
    };
    const queue = await loadQueue();
    queue.unshift(entry);
    await saveQueue(queue);
    setRecordings(queue);
    processQueue(setRecordings);
    return entry;
  }, [recorder]);

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

  return {
    recordings,
    isRecording: recorderState.isRecording,
    durationMillis: recorderState.durationMillis,
    startRecording,
    stopRecording,
    retry,
    remove,
  };
}
