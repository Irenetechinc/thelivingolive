import React, { createContext, useContext } from "react";
import { useSermonRecordings, type SermonRecording } from "../lib/sermonRecorder";

type RecordingContextValue = {
  recordings: SermonRecording[];
  isRecording: boolean;
  durationMillis: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<SermonRecording | null>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  editText: (id: string, text: string) => Promise<void>;
};

const RecordingContext = createContext<RecordingContextValue | null>(null);

// Owns the ONE audio-recorder instance for the whole app, mounted once at
// the root (see App.tsx) instead of inside the Notes/Highlights screen.
// That's deliberate: a hook that lives inside a screen gets torn down the
// moment the screen unmounts, which is what used to stop an in-progress
// recording the instant the user navigated away. Living at the root means
// the recorder — and the transcription queue — keep running across any
// amount of navigation, and only stop if the OS kills the app outright.
export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const value = useSermonRecordings();
  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error("useRecording must be used within a RecordingProvider");
  return ctx;
}
