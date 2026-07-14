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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";
import { useRecording } from "../../context/RecordingContext";
import type { SermonRecording } from "../../lib/sermonRecorder";

// Manual (typed, not tied to a specific verse) notes use these sentinel
// values for the NOT NULL book_id/book_name/chapter columns — the notes
// table was designed around chapter-scoped notes, so a general note is
// stored the same way with an obvious, filterable marker instead of a
// schema migration.
const GENERAL_NOTE_BOOK_ID = 0;
const GENERAL_NOTE_BOOK_NAME = "General note";

type NoteRow = {
  id: string;
  book_id: number;
  book_name: string;
  chapter: number;
  verse: number | null;
  content: string;
  created_at: string;
};

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
      if (isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch (e) {
      // Permission denied or device issue — silently ignored in UI here,
      // button just doesn't start; icon states make it obvious nothing began.
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.recorderCard}>
      <Text style={styles.recorderTitle}>Sermon Recorder</Text>
      <Text style={styles.recorderSub}>
        Record a sermon and it's turned into formatted notes automatically. Recording works fully
        offline and keeps going if you minimize the app; transcription finishes once you're online.
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
              {rec.status === "failed" || rec.status === "queued" ? (
                <Pressable onPress={() => retry(rec.id)} hitSlop={8}>
                  <Text style={styles.recordingAction}>Retry</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => remove(rec.id)} hitSlop={8}>
                <Text style={[styles.recordingAction, { color: colors.danger }]}>Delete</Text>
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

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

function ManualNoteComposer({ onSaved }: { onSaved: (note: NoteRow) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
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
          content: text.trim(),
        })
        .select()
        .single();
      if (insertError) throw insertError;
      onSaved(data as NoteRow);
      setText("");
      setOpen(false);
      Keyboard.dismiss();
    } catch (e: any) {
      setError(e.message ?? "Couldn't save the note. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Pressable style={styles.newNoteBtn} onPress={() => setOpen(true)}>
        <Text style={styles.newNoteBtnText}>+ Write a note</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.composerCard}>
      <TextInput
        style={styles.composerInput}
        placeholder="Write down a thought, prayer request, or anything you want to remember…"
        placeholderTextColor={colors.inkFaint}
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        textAlignVertical="top"
      />
      {error && <Text style={styles.composerError}>{error}</Text>}
      <View style={styles.viewerActionsRow}>
        <Pressable
          style={[styles.viewerClose, styles.viewerCancel]}
          onPress={() => {
            setOpen(false);
            setText("");
            setError(null);
            Keyboard.dismiss();
          }}
        >
          <Text style={[styles.viewerCloseText, { color: colors.inkSoft }]}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.viewerClose, { flex: 1 }, (!text.trim() || saving) && { opacity: 0.6 }]}
          onPress={save}
          disabled={!text.trim() || saving}
        >
          {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.viewerCloseText}>Save note</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export default function NotesScreen() {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const { data } = await supabase
          .from("notes")
          .select("id, book_id, book_name, chapter, verse, content, created_at")
          .order("created_at", { ascending: false });
        if (active) {
          setNotes(data ?? []);
          setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [])
  );

  return (
    <View style={styles.container}>
      {/* Header strip */}
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
          ListHeaderComponent={
            <>
              <SermonRecorderCard />
              <ManualNoteComposer onSaved={(note) => setNotes((prev) => [note, ...prev])} />
            </>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptySymbol}>✦</Text>
              <Text style={styles.emptyTitle}>No notes yet</Text>
              <Text style={styles.emptyText}>
                Tap any verse while reading to highlight it or add a note, write one above, or open
                the floating notes widget on any chapter.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.refBadge}>
                  <Text style={styles.refText}>
                    {item.book_id === GENERAL_NOTE_BOOK_ID
                      ? "General note"
                      : `${item.book_name} ${item.chapter}${item.verse ? `:${item.verse}` : ""}`}
                  </Text>
                </View>
                <Text style={styles.dateText}>
                  {new Date(item.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </View>
              <Text style={styles.content}>{item.content}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

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
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptySymbol: { fontSize: 36, color: colors.oliveFaint, marginBottom: spacing.md },
  emptyTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: spacing.sm },
  emptyText: {
    ...typography.bodySmall,
    color: colors.inkSoft,
    textAlign: "center",
    lineHeight: 22,
  },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
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
    marginBottom: spacing.sm,
  },
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

  recorderCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.subtle,
  },
  recorderTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: 4 },
  recorderSub: { ...typography.bodySmall, fontSize: 13, color: colors.inkSoft, lineHeight: 19, marginBottom: spacing.md },
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
    alignItems: "center",
    marginBottom: spacing.md,
  },
  viewerTitle: { ...typography.title, fontSize: 18, color: colors.oliveDark },
  viewerEditLink: { ...typography.caption, color: colors.olive, fontWeight: "700" },
  viewerText: { ...typography.body, color: colors.ink, marginBottom: spacing.md },
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
  viewerCancel: { flex: 0, paddingHorizontal: spacing.lg, backgroundColor: colors.parchmentMid },
  viewerClose: {
    backgroundColor: colors.olive,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  viewerCloseText: { color: colors.white, fontWeight: "700" },

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
  },
  composerInput: {
    ...typography.bodySmall,
    color: colors.ink,
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    padding: spacing.md,
    minHeight: 100,
    marginBottom: spacing.sm,
  },
  composerError: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
});
