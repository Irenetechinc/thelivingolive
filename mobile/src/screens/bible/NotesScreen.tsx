import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Animated,
  Modal,
  ScrollView,
  TextInput,
  Keyboard,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { supabase } from "../../lib/supabase";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";
import { useRecording } from "../../context/RecordingContext";
import type { SermonRecording } from "../../lib/sermonRecorder";

// General (non-verse) notes use these sentinels for the NOT NULL schema columns.
const GENERAL_NOTE_BOOK_ID = 0;
const GENERAL_NOTE_BOOK_NAME = "General note";

type NoteRow = {
  id: string;
  book_id: number;
  book_name: string;
  chapter: number;
  verse: number | null;
  content: string;
  title: string | null;
  verse_ref: string | null;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const day = 86_400_000;
  if (diff < day && d.getDate() === now.getDate()) return "Today";
  if (diff < 2 * day) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function statusLabel(rec: SermonRecording) {
  if (rec.status === "done") return "Ready";
  if (rec.status === "transcribing") return "Transcribing…";
  if (rec.status === "failed") return "Failed";
  return "Queued — waiting for connection";
}

// ── Sermon Recorder Card ──────────────────────────────────────────────────────

function SermonRecorderCard() {
  const { recordings, isRecording, durationMillis, startRecording, stopRecording, retry, remove, editText } =
    useRecording();
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<SermonRecording | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
  }, [isRecording]);

  async function handlePress() {
    setBusy(true);
    try {
      if (isRecording) await stopRecording();
      else await startRecording();
    } catch {
      // Permission denied or device issue — button resets visually
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.recorderCard}>
      <Text style={styles.recorderTitle}>Sermon Recorder</Text>
      <Text style={styles.recorderSub}>
        Record a full sermon and it's transcribed into formatted notes. Works offline — transcription
        finishes once you reconnect.
      </Text>

      <Pressable
        style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
        onPress={handlePress}
        disabled={busy}
      >
        <Animated.View
          style={[
            styles.recordDot,
            isRecording && {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }),
            },
          ]}
        />
        <Text style={styles.recordBtnText}>
          {isRecording ? `Stop recording · ${formatDuration(durationMillis)}` : "Start recording"}
        </Text>
      </Pressable>

      {recordings.length > 0 && (
        <View style={styles.recordingsList}>
          {recordings.map((rec) => (
            <Pressable
              key={rec.id}
              style={styles.recordingRow}
              onPress={() => rec.status === "done" && setViewing(rec)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.recordingTitle} numberOfLines={1}>
                  {rec.title || new Date(rec.createdAt).toLocaleString()}
                </Text>
                <Text
                  style={[
                    styles.recordingStatus,
                    rec.status === "done" && { color: colors.olive },
                    rec.status === "failed" && { color: colors.danger },
                  ]}
                >
                  {statusLabel(rec)}
                </Text>
              </View>
              {(rec.status === "failed" || rec.status === "queued") && (
                <Pressable onPress={() => retry(rec.id)} hitSlop={8}>
                  <Text style={styles.recordingAction}>Retry</Text>
                </Pressable>
              )}
              <Pressable onPress={() => remove(rec.id)} hitSlop={8}>
                <Text style={[styles.recordingAction, { color: colors.danger }]}>Delete</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      {/* Transcript viewer / editor */}
      <Modal
        visible={!!viewing}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setViewing(null);
          setEditing(false);
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setViewing(null);
            setEditing(false);
          }}
        />
        <View style={styles.viewerSheet}>
          <View style={styles.viewerHeaderRow}>
            <Text style={styles.viewerTitle}>{viewing?.title || "Transcript"}</Text>
            {!editing && (
              <Pressable
                onPress={() => {
                  setDraftText(viewing?.formattedText ?? "");
                  setEditing(true);
                }}
              >
                <Text style={styles.viewerEditLink}>Edit</Text>
              </Pressable>
            )}
          </View>
          {editing ? (
            <>
              <TextInput
                style={styles.editInput}
                value={draftText}
                onChangeText={setDraftText}
                multiline
                textAlignVertical="top"
                autoFocus
              />
              <View style={styles.viewerActionsRow}>
                <Pressable
                  style={[styles.viewerClose, styles.viewerCancel]}
                  onPress={() => {
                    setEditing(false);
                    Keyboard.dismiss();
                  }}
                >
                  <Text style={[styles.viewerCloseText, { color: colors.inkSoft }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.viewerClose, { flex: 1 }, savingEdit && { opacity: 0.6 }]}
                  disabled={savingEdit}
                  onPress={async () => {
                    if (!viewing) return;
                    setSavingEdit(true);
                    try {
                      await editText(viewing.id, draftText);
                      setViewing({ ...viewing, formattedText: draftText, edited: true });
                      setEditing(false);
                      Keyboard.dismiss();
                    } finally {
                      setSavingEdit(false);
                    }
                  }}
                >
                  {savingEdit ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={styles.viewerCloseText}>Save changes</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={styles.viewerText}>{viewing?.formattedText}</Text>
              </ScrollView>
              <Pressable style={styles.viewerClose} onPress={() => setViewing(null)}>
                <Text style={styles.viewerCloseText}>Close</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Note Composer — type or speak ─────────────────────────────────────────────
// Requires migration: see server/supabase/notes-migration.sql
// Columns added: notes.title (text, nullable), notes.verse_ref (text, nullable)

function NoteComposer({ onSaved }: { onSaved: (note: NoteRow) => void }) {
  const [open, setOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteVerseRef, setNoteVerseRef] = useState("");
  const [interimText, setInterimText] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Speech recognition event handlers ─────────────────────────────────────
  // useSpeechRecognitionEvent registers listeners as long as this component
  // is mounted, so we check `open` inside the handlers to avoid side-effects
  // when the composer is collapsed.

  useSpeechRecognitionEvent("start", () => setRecognizing(true));

  useSpeechRecognitionEvent("end", () => {
    setRecognizing(false);
    setInterimText("");
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      setNoteContent((prev) => {
        const needsSpace = prev.length > 0 && !prev.endsWith(" ") && !prev.endsWith("\n");
        return prev + (needsSpace ? " " : "") + transcript;
      });
      setInterimText("");
    } else {
      setInterimText(transcript);
    }
  });

  useSpeechRecognitionEvent("error", (_event) => {
    setRecognizing(false);
    setInterimText("");
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  async function toggleVoice() {
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
    } else {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Microphone access needed",
          "Go to Settings → The Living Olive and enable the microphone to use voice notes."
        );
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
      });
    }
  }

  async function save() {
    if (!noteContent.trim()) return;
    setSaving(true);
    setError(null);
    if (recognizing) ExpoSpeechRecognitionModule.stop();
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const { data, error: insertError } = await supabase
        .from("notes")
        .insert({
          user_id: userData.user.id,
          version: "KJV",
          book_id: GENERAL_NOTE_BOOK_ID,
          book_name: GENERAL_NOTE_BOOK_NAME,
          chapter: 0,
          verse: null,
          content: noteContent.trim(),
          title: noteTitle.trim() || null,
          verse_ref: noteVerseRef.trim() || null,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      onSaved(data as NoteRow);
      setNoteTitle("");
      setNoteContent("");
      setNoteVerseRef("");
      setInterimText("");
      setOpen(false);
      Keyboard.dismiss();
    } catch {
      setError("Couldn't save note. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (recognizing) ExpoSpeechRecognitionModule.stop();
    setOpen(false);
    setNoteTitle("");
    setNoteContent("");
    setNoteVerseRef("");
    setInterimText("");
    setError(null);
    Keyboard.dismiss();
  }

  // ── Collapsed state ───────────────────────────────────────────────────────

  if (!open) {
    return (
      <Pressable style={styles.newNoteBtn} onPress={() => setOpen(true)}>
        <Text style={styles.newNoteBtnText}>+ Write a note</Text>
      </Pressable>
    );
  }

  // ── Expanded composer ─────────────────────────────────────────────────────

  return (
    <View style={styles.composerCard}>
      {/* Title */}
      <TextInput
        style={styles.composerTitle}
        placeholder="Title (optional)"
        placeholderTextColor={colors.inkFaint}
        value={noteTitle}
        onChangeText={setNoteTitle}
        returnKeyType="next"
      />

      {/* Verse tag */}
      <View style={styles.composerVerseRow}>
        <Text style={styles.composerVerseIcon}>📖</Text>
        <TextInput
          style={styles.composerVerseInput}
          placeholder="Tag a verse, e.g. John 3:16 (optional)"
          placeholderTextColor={colors.inkFaint}
          value={noteVerseRef}
          onChangeText={setNoteVerseRef}
          returnKeyType="next"
          autoCapitalize="words"
        />
      </View>

      {/* Content — disabled while recognizing so speech fills it */}
      <TextInput
        style={styles.composerInput}
        placeholder={
          recognizing
            ? "Listening… speak your note"
            : "Write your note, or tap 🎤 to speak"
        }
        placeholderTextColor={colors.inkFaint}
        value={noteContent}
        onChangeText={recognizing ? undefined : setNoteContent}
        editable={!recognizing}
        multiline
        textAlignVertical="top"
      />

      {/* Live interim speech preview */}
      {interimText !== "" && (
        <View style={styles.interimRow}>
          <Text style={styles.interimDot}>🎤</Text>
          <Text style={styles.interimText} numberOfLines={3}>
            {interimText}
          </Text>
        </View>
      )}

      {recognizing && interimText === "" && (
        <View style={styles.interimRow}>
          <ActivityIndicator color={colors.olive} size="small" style={{ marginRight: 6 }} />
          <Text style={styles.interimListening}>Listening…</Text>
        </View>
      )}

      {error && <Text style={styles.composerError}>{error}</Text>}

      {/* Action bar */}
      <View style={styles.composerActions}>
        <Pressable style={styles.composerCancelBtn} onPress={discard}>
          <Text style={styles.composerCancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.composerMicBtn, recognizing && styles.composerMicBtnActive]}
          onPress={toggleVoice}
          hitSlop={6}
        >
          <Text style={styles.composerMicIcon}>{recognizing ? "⏹" : "🎤"}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.composerSaveBtn,
            (!noteContent.trim() || saving) && { opacity: 0.5 },
          ]}
          onPress={save}
          disabled={!noteContent.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.composerSaveText}>Save note</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function NotesScreen() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingNote, setViewingNote] = useState<NoteRow | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const { data } = await supabase
          .from("notes")
          .select("id, book_id, book_name, chapter, verse, content, title, verse_ref, created_at")
          .order("created_at", { ascending: false });
        if (active) {
          setNotes((data as NoteRow[]) ?? []);
          setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  function getDisplayRef(note: NoteRow): string {
    if (note.verse_ref) return note.verse_ref;
    if (note.book_id === GENERAL_NOTE_BOOK_ID) return "General note";
    return `${note.book_name} ${note.chapter}${note.verse ? `:${note.verse}` : ""}`;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#2E3A1F", "#3E4A2F", "#4A5A36"]}
        style={styles.header}
      >
        <Text style={styles.headerEyebrow}>YOUR STUDY NOTES</Text>
        <Text style={styles.headerTitle}>Highlights & Notes</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.olive} size="large" />
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              <SermonRecorderCard />
              <NoteComposer onSaved={(note) => setNotes((prev) => [note, ...prev])} />
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptySymbol}>✦</Text>
              <Text style={styles.emptyTitle}>No notes yet</Text>
              <Text style={styles.emptyText}>
                Tap any verse while reading to add a note, write one above, or tap 🎤 to speak your
                thoughts.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              onPress={() => setViewingNote(item)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.refBadge}>
                  <Text style={styles.refText}>{getDisplayRef(item)}</Text>
                </View>
                <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
              </View>
              {item.title ? (
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              ) : null}
              <Text style={styles.content} numberOfLines={3}>
                {item.content}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* Note detail viewer */}
      <Modal
        visible={!!viewingNote}
        animationType="slide"
        transparent
        onRequestClose={() => setViewingNote(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setViewingNote(null)} />
        <View style={styles.viewerSheet}>
          <View style={styles.viewerHeaderRow}>
            <View style={{ flex: 1 }}>
              {viewingNote?.title ? (
                <Text style={styles.viewerTitle}>{viewingNote.title}</Text>
              ) : null}
              <View style={styles.viewerMeta}>
                <View style={styles.refBadge}>
                  <Text style={styles.refText}>
                    {viewingNote ? getDisplayRef(viewingNote) : ""}
                  </Text>
                </View>
                {viewingNote && (
                  <Text style={styles.viewerDate}>{formatDate(viewingNote.created_at)}</Text>
                )}
              </View>
            </View>
          </View>
          <ScrollView style={{ maxHeight: 400 }}>
            <Text style={styles.viewerText}>{viewingNote?.content}</Text>
          </ScrollView>
          <Pressable style={styles.viewerClose} onPress={() => setViewingNote(null)}>
            <Text style={styles.viewerCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerEyebrow: {
    ...typography.micro,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  headerTitle: { fontSize: 24, fontWeight: "700", color: colors.white, letterSpacing: -0.4 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyWrap: { alignItems: "center", padding: spacing.xl },
  emptySymbol: { fontSize: 36, color: colors.oliveFaint, marginBottom: spacing.md },
  emptyTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: spacing.sm },
  emptyText: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center", lineHeight: 22 },

  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  // ── Note card ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadows.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: spacing.xs },
  refBadge: {
    backgroundColor: colors.parchment,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
  },
  refText: { ...typography.caption, color: colors.oliveDark, fontWeight: "600" },
  dateText: { ...typography.micro, color: colors.inkFaint },
  content: { ...typography.bodySmall, color: colors.ink, lineHeight: 22 },

  // ── Composer ──────────────────────────────────────────────────────────────
  newNoteBtn: {
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    borderStyle: "dashed",
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.lg,
    backgroundColor: colors.white,
  },
  newNoteBtnText: { color: colors.olive, fontWeight: "700", fontSize: 14 },

  composerCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.subtle,
    gap: spacing.sm,
  },
  composerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
  },
  composerVerseRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F4E8",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "#C2D4A0",
    paddingHorizontal: spacing.md,
  },
  composerVerseIcon: { fontSize: 14, marginRight: spacing.sm },
  composerVerseInput: { flex: 1, fontSize: 13, color: colors.ink, paddingVertical: spacing.sm },
  composerInput: {
    ...typography.bodySmall,
    color: colors.ink,
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: "top",
  },
  interimRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F5F5F0",
    borderRadius: radii.sm,
    padding: spacing.sm,
    gap: 6,
  },
  interimDot: { fontSize: 12, marginTop: 1 },
  interimText: {
    flex: 1,
    fontSize: 13,
    color: colors.inkSoft,
    fontStyle: "italic",
    lineHeight: 19,
  },
  interimListening: { fontSize: 13, color: colors.inkSoft, fontStyle: "italic" },
  composerError: { ...typography.caption, color: colors.danger },
  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  composerCancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.parchmentMid,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
  },
  composerCancelText: { fontSize: 13, color: colors.inkSoft, fontWeight: "600" },
  composerMicBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.parchmentMid,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
  },
  composerMicBtnActive: { backgroundColor: "#FDECEA", borderColor: colors.danger },
  composerMicIcon: { fontSize: 18 },
  composerSaveBtn: {
    flex: 1,
    backgroundColor: colors.olive,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  composerSaveText: { color: colors.white, fontWeight: "700", fontSize: 14 },

  // ── Sermon recorder card ──────────────────────────────────────────────────
  recorderCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.subtle,
  },
  recorderTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: 4 },
  recorderSub: {
    ...typography.bodySmall,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.oliveDark,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm + 2,
  },
  recordBtnActive: { backgroundColor: colors.danger },
  recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.white },
  recordBtnText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  recordingsList: { marginTop: spacing.md, gap: spacing.sm },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.parchmentMid,
  },
  recordingTitle: { ...typography.bodySmall, fontSize: 13, color: colors.ink, fontWeight: "600" },
  recordingStatus: { ...typography.micro, color: colors.inkFaint, marginTop: 2 },
  recordingAction: { ...typography.caption, color: colors.olive, fontWeight: "700" },

  // ── Modal / viewer ────────────────────────────────────────────────────────
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  viewerSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
  },
  viewerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  viewerTitle: { ...typography.title, fontSize: 18, color: colors.oliveDark, marginBottom: 4 },
  viewerMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  viewerDate: { ...typography.micro, color: colors.inkFaint },
  viewerEditLink: { ...typography.caption, color: colors.olive, fontWeight: "700" },
  viewerText: {
    ...typography.body,
    color: colors.ink,
    marginBottom: spacing.md,
    lineHeight: 26,
  },
  editInput: {
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    padding: spacing.md,
    minHeight: 220,
    maxHeight: 320,
    marginBottom: spacing.md,
  },
  viewerActionsRow: { flexDirection: "row", gap: spacing.sm },
  viewerCancel: {
    flex: 0,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.parchmentMid,
  },
  viewerClose: {
    backgroundColor: colors.olive,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  viewerCloseText: { color: colors.white, fontWeight: "700" },
});
