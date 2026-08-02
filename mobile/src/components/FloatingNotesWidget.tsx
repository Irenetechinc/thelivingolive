import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { supabase } from "../lib/supabase";
import { colors, radii, spacing, typography, shadows } from "../theme/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const BUBBLE_SIZE = 56;
const LAST_NOTE_KEY = "floatingNotes.lastNote";
// Panel always opens anchored to the right side of the screen so all content
// is visible without needing to drag. Width fills most of the screen.
const PANEL_W = SCREEN_W - 16;
const PANEL_H = SCREEN_H * 0.62;
const DEFAULT_PANEL = { width: PANEL_W, height: PANEL_H };
const MIN_PANEL = { width: 280, height: 260 };
const MAX_PANEL = { width: SCREEN_W - 8, height: SCREEN_H - 120 };

type NoteRow = {
  id: string;
  book_name: string;
  chapter: number;
  verse: number | null;
  content: string;
  created_at: string;
};

type Props = {
  bookId: number;
  bookName: string;
  chapter: number;
  version: string;
};

// A draggable, resizable floating widget that stays on top of the Bible
// reading screen while it's still open and scrollable underneath — instead
// of a modal that blocks the page, notes can be reviewed and added without
// losing your place in the text.
export default function FloatingNotesWidget({ bookId, bookName, chapter, version }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastNote, setLastNote] = useState<NoteRow | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Voice input state
  const [recognizing, setRecognizing] = useState(false);
  const [interimText, setInterimText] = useState("");

  // Edit state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Bubble is draggable when collapsed. When expanded the panel snaps to the
  // right edge of the screen so all note content is visible.
  const pos = useRef(
    new Animated.ValueXY({ x: SCREEN_W - BUBBLE_SIZE - 16, y: SCREEN_H - BUBBLE_SIZE - 140 })
  ).current;
  const size = useRef({ w: DEFAULT_PANEL.width, h: DEFAULT_PANEL.height });
  const [, forceSize] = useState(0);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);

  // Voice recognition event handlers (registered at component top level)
  useSpeechRecognitionEvent("start", () => setRecognizing(true));
  useSpeechRecognitionEvent("end", () => {
    setRecognizing(false);
    setInterimText("");
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (event.isFinal) {
      setDraft((prev) =>
        prev + (prev.length && !prev.endsWith(" ") ? " " : "") + event.results[0].transcript
      );
      setInterimText("");
    } else {
      setInterimText(event.results[0]?.transcript ?? "");
    }
  });
  useSpeechRecognitionEvent("error", () => {
    setRecognizing(false);
    setInterimText("");
  });

  async function toggleVoice() {
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
    } else {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) return;
      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true });
    }
  }

  // Restore the last-created note immediately (fast, offline-friendly cache)
  // so the bubble reflects it even before the network fetch below resolves.
  useEffect(() => {
    AsyncStorage.getItem(LAST_NOTE_KEY).then((raw) => {
      if (raw) {
        try {
          setLastNote(JSON.parse(raw));
        } catch {}
      }
    });
  }, []);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notes")
      .select("id, book_name, chapter, verse, content, created_at")
      .eq("book_id", bookId)
      .eq("chapter", chapter)
      .order("created_at", { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  }, [bookId, chapter]);

  // Also confirm the true latest note (any chapter) from the server so the
  // bubble badge is accurate after navigating away and back.
  const refreshLatest = useCallback(async () => {
    const { data } = await supabase
      .from("notes")
      .select("id, book_name, chapter, verse, content, created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data[0]) {
      setLastNote(data[0]);
      AsyncStorage.setItem(LAST_NOTE_KEY, JSON.stringify(data[0])).catch(() => {});
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotes();
      refreshLatest();
    }, [loadNotes, refreshLatest])
  );

  const bubblePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragged.current = false;
        pos.setOffset({ x: (pos.x as any)._value, y: (pos.y as any)._value });
        pos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) dragged.current = true;
        pos.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: () => {
        pos.flattenOffset();
        // Clamp to screen bounds
        const cur = { x: (pos.x as any)._value, y: (pos.y as any)._value };
        const clampedX = Math.min(Math.max(cur.x, 4), SCREEN_W - BUBBLE_SIZE - 4);
        const clampedY = Math.min(Math.max(cur.y, 40), SCREEN_H - BUBBLE_SIZE - 40);
        Animated.spring(pos, { toValue: { x: clampedX, y: clampedY }, useNativeDriver: false }).start();
        if (!dragged.current) {
          setExpanded((v) => !v);
        }
      },
    })
  ).current;

  const resizePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        size.current = {
          w: Math.min(Math.max(size.current.w + gesture.dx * 0.05, MIN_PANEL.width), MAX_PANEL.width),
          h: Math.min(Math.max(size.current.h + gesture.dy * 0.05, MIN_PANEL.height), MAX_PANEL.height),
        };
        forceSize((n) => n + 1);
      },
    })
  ).current;

  async function handleAddNote() {
    if (!draft.trim()) return;
    // Stop any active recognition before saving
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
    }
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not signed in");
      const { data: inserted, error } = await supabase
        .from("notes")
        .insert({
          user_id: data.user.id,
          version,
          book_id: bookId,
          book_name: bookName,
          chapter,
          verse: null,
          content: draft.trim(),
        })
        .select()
        .single();
      if (error) throw error;
      setDraft("");
      setNotes((prev) => [inserted, ...prev]);
      setLastNote(inserted);
      AsyncStorage.setItem(LAST_NOTE_KEY, JSON.stringify(inserted)).catch(() => {});
      Keyboard.dismiss();
    } catch {
      // Swallow — widget stays open, user can retry
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(noteId: string) {
    if (!editDraft.trim()) return;
    try {
      const { error } = await supabase
        .from("notes")
        .update({ content: editDraft.trim() })
        .eq("id", noteId);
      if (error) throw error;
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, content: editDraft.trim() } : n))
      );
      setEditingNoteId(null);
      setEditDraft("");
    } catch {
      // Swallow — user can retry
    }
  }

  // When expanded, anchor the panel to the right edge of the screen so the
  // user can see all content without having to drag it into view.
  const expandedStyle = expanded
    ? { position: "absolute" as const, right: 8, top: 60, left: undefined, transform: [] }
    : {};

  return (
    <Animated.View
      style={[
        styles.wrap,
        expanded
          ? expandedStyle
          : { transform: [{ translateX: pos.x }, { translateY: pos.y }] },
      ]}
    >
      {expanded ? (
        <View style={[styles.panel, { width: size.current.w, height: size.current.h }]}>
          {/* Drag handle header */}
          <View style={styles.panelHeader} {...bubblePanResponder.panHandlers}>
            <View style={styles.dragDots}>
              <View style={styles.dragDot} />
              <View style={styles.dragDot} />
              <View style={styles.dragDot} />
            </View>
            <Text style={styles.panelTitle} numberOfLines={1}>
              Notes — {bookName} {chapter}
            </Text>
            <Pressable onPress={() => setExpanded(false)} hitSlop={8}>
              <Ionicons name="close-outline" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          <View style={styles.composerRow}>
            <TextInput
              style={styles.composerInput}
              placeholder="Jot a thought about this chapter…"
              placeholderTextColor={colors.inkFaint}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Pressable
              style={styles.micBtn}
              onPress={toggleVoice}
              hitSlop={6}
            >
              <Ionicons
                name={recognizing ? "stop-circle-outline" : "mic-outline"}
                size={22}
                color={recognizing ? "#e53e3e" : colors.olive}
              />
            </Pressable>
            <Pressable
              style={[styles.addBtn, (!draft.trim() || saving) && { opacity: 0.5 }]}
              onPress={handleAddNote}
              disabled={!draft.trim() || saving}
            >
              {saving ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.addBtnText}>Save</Text>}
            </Pressable>
          </View>
          {interimText.length > 0 && (
            <Text style={styles.interimText}>{interimText}</Text>
          )}

          {loading ? (
            <ActivityIndicator color={colors.olive} style={{ marginTop: spacing.md }} />
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {notes.length === 0 ? (
                <Text style={styles.emptyText}>No notes on this chapter yet.</Text>
              ) : (
                notes.map((n) => (
                  <View key={n.id} style={styles.noteCard}>
                    <View style={styles.noteCardHeader}>
                      <Text style={styles.noteRef}>
                        {n.verse ? `verse ${n.verse}` : "chapter note"} ·{" "}
                        {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Text>
                      {editingNoteId !== n.id && (
                        <Pressable
                          hitSlop={6}
                          onPress={() => {
                            setEditingNoteId(n.id);
                            setEditDraft(n.content);
                          }}
                        >
                          <Ionicons name="pencil-outline" size={13} color={colors.inkFaint} />
                        </Pressable>
                      )}
                    </View>
                    {editingNoteId === n.id ? (
                      <View>
                        <TextInput
                          style={styles.editInput}
                          value={editDraft}
                          onChangeText={setEditDraft}
                          multiline
                          autoFocus
                        />
                        <View style={styles.editActions}>
                          <Pressable
                            style={styles.editCancelBtn}
                            onPress={() => {
                              setEditingNoteId(null);
                              setEditDraft("");
                            }}
                          >
                            <Text style={styles.editCancelText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.editSaveBtn, !editDraft.trim() && { opacity: 0.5 }]}
                            onPress={() => handleSaveEdit(n.id)}
                            disabled={!editDraft.trim()}
                          >
                            <Text style={styles.editSaveText}>Save</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.noteContent}>{n.content}</Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {/* Resize handle */}
          <View style={styles.resizeHandle} {...resizePanResponder.panHandlers}>
            <View style={styles.resizeGrip} />
          </View>
        </View>
      ) : (
        <View {...bubblePanResponder.panHandlers} style={styles.bubble}>
          <Ionicons name="create-outline" size={22} color={colors.parchment} />
          {lastNote ? <View style={styles.bubbleDot} /> : null}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 60,
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: colors.oliveDark,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.cardLg,
  },
  bubbleDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: colors.oliveDark,
  },
  panel: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    overflow: "hidden",
    ...shadows.cardLg,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.oliveDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  dragDots: { flexDirection: "row", gap: 3 },
  dragDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" },
  panelTitle: { ...typography.caption, color: colors.parchment, flex: 1, fontWeight: "700" },
  composerRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
    alignItems: "flex-end",
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.ink,
    maxHeight: 60,
  },
  micBtn: {
    paddingBottom: 6,
    paddingHorizontal: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtn: {
    backgroundColor: colors.olive,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  addBtnText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  interimText: {
    fontSize: 11,
    color: colors.inkFaint,
    fontStyle: "italic",
    paddingHorizontal: spacing.sm,
    paddingBottom: 4,
  },
  list: { flex: 1, padding: spacing.sm },
  emptyText: { ...typography.caption, color: colors.inkFaint, padding: spacing.sm },
  noteCard: {
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  noteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  noteRef: { ...typography.micro, color: colors.oliveDark, letterSpacing: 0.4 },
  noteContent: { ...typography.bodySmall, fontSize: 13, color: colors.ink, lineHeight: 19 },
  editInput: {
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    marginBottom: 6,
  },
  editActions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "flex-end",
  },
  editCancelBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.inkFaint,
  },
  editCancelText: { fontSize: 11, color: colors.inkFaint },
  editSaveBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.olive,
  },
  editSaveText: { fontSize: 11, color: colors.white, fontWeight: "700" },
  resizeHandle: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  resizeGrip: {
    width: 12,
    height: 12,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: colors.parchmentDark,
  },
});
