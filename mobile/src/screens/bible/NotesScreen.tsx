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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";
import { useSermonRecordings, type SermonRecording } from "../../lib/sermonRecorder";

type NoteRow = {
  id: string;
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
  const { recordings, isRecording, durationMillis, startRecording, stopRecording, retry, remove } =
    useSermonRecordings();
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<SermonRecording | null>(null);
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

      <Modal visible={!!viewing} animationType="slide" transparent onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setViewing(null)} />
        <View style={styles.viewerSheet}>
          <Text style={styles.viewerTitle}>{viewing?.title}</Text>
          <ScrollView style={{ maxHeight: 400 }}>
            <Text style={styles.viewerText}>{viewing?.formattedText}</Text>
          </ScrollView>
          <Pressable style={styles.viewerClose} onPress={() => setViewing(null)}>
            <Text style={styles.viewerCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
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
          .select("id, book_name, chapter, verse, content, created_at")
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
          ListHeaderComponent={<SermonRecorderCard />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptySymbol}>✦</Text>
              <Text style={styles.emptyTitle}>No notes yet</Text>
              <Text style={styles.emptyText}>
                Tap any verse while reading to highlight it or add a note, or open the floating notes
                widget on any chapter.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.refBadge}>
                  <Text style={styles.refText}>
                    {item.book_name} {item.chapter}
                    {item.verse ? `:${item.verse}` : ""}
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
  viewerTitle: { ...typography.title, fontSize: 18, color: colors.oliveDark, marginBottom: spacing.md },
  viewerText: { ...typography.body, color: colors.ink, marginBottom: spacing.md },
  viewerClose: {
    backgroundColor: colors.olive,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  viewerCloseText: { color: colors.white, fontWeight: "700" },
});
