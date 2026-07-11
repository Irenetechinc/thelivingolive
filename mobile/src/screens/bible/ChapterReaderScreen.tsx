import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import type { BibleVersion } from "./BibleHomeScreen";
import { loadChapterVerses } from "../../data/bibleLoader";
import { supabase } from "../../lib/supabase";
import { explainVerse } from "../../lib/api";
import { colors, radii, spacing, typography } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ChapterReader">;

export default function ChapterReaderScreen({ route }: Props) {
  const { bookId, bookName, chapter, version: versionProp = "KJV" } = route.params;

  const [verses, setVerses] = useState<string[]>([]);
  const [activeVersion, setActiveVersion] = useState(versionProp);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [loadingChapter, setLoadingChapter] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingChapter(true);
    setLoadError(null);
    setFallbackNotice(null);
    loadChapterVerses(bookId, chapter, versionProp)
      .then((result) => {
        setVerses(result.verses);
        setActiveVersion(result.version as BibleVersion);
        if (result.fallback && result.fallbackReason) {
          setFallbackNotice(result.fallbackReason);
        }
      })
      .catch((e) => setLoadError(e.message ?? "Couldn't load this chapter."))
      .finally(() => setLoadingChapter(false));
  }, [bookId, chapter, versionProp]);

  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<Record<number, string>>({});
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [supportingScriptures, setSupportingScriptures] = useState<
    { reference: string; note: string }[]
  >([]);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"actions" | "note" | "explain" | null>(null);

  // Load saved highlights for this chapter
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: rows } = await supabase
        .from("highlights")
        .select("verse, color")
        .match({ user_id: data.user.id, book_id: bookId, chapter });
      if (rows) {
        const map: Record<number, string> = {};
        for (const r of rows) map[r.verse] = r.color;
        setHighlighted(map);
      }
    })();
  }, [bookId, chapter]);

  function openVerse(verseNumber: number) {
    setSelectedVerse(verseNumber);
    setModalMode("actions");
    setNoteText("");
    setExplanation(null);
    setExplainError(null);
  }

  async function toggleHighlight() {
    if (selectedVerse == null) return;
    const isOn = !highlighted[selectedVerse];
    setHighlighted((prev) => {
      const next = { ...prev };
      if (isOn) next[selectedVerse] = "#F6E3A1";
      else delete next[selectedVerse];
      return next;
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    if (isOn) {
      await supabase.from("highlights").insert({
        user_id: data.user.id,
        version: activeVersion,
        book_id: bookId,
        book_name: bookName,
        chapter,
        verse: selectedVerse,
        color: "#F6E3A1",
      });
    } else {
      await supabase
        .from("highlights")
        .delete()
        .match({ user_id: data.user.id, book_id: bookId, chapter, verse: selectedVerse });
    }
    setModalMode(null);
  }

  async function saveNote() {
    if (selectedVerse == null || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not signed in");
      await supabase.from("notes").insert({
        user_id: data.user.id,
        version: activeVersion,
        book_id: bookId,
        book_name: bookName,
        chapter,
        verse: selectedVerse,
        content: noteText.trim(),
      });
      setModalMode(null);
    } finally {
      setSavingNote(false);
    }
  }

  async function runExplain() {
    if (selectedVerse == null) return;
    setModalMode("explain");
    setLoadingExplanation(true);
    setExplainError(null);
    try {
      const result = await explainVerse({
        reference: `${bookName} ${chapter}:${selectedVerse}`,
        text: verses[selectedVerse - 1],
        version: activeVersion,
      });
      setExplanation(result.explanation);
      setSupportingScriptures(result.supportingScriptures ?? []);
    } catch (e: any) {
      setExplainError(e.message ?? "Couldn't generate explanation.");
    } finally {
      setLoadingExplanation(false);
    }
  }

  if (loadingChapter) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.olive} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.error}>{loadError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Version badge + optional fallback notice */}
      <View style={styles.metaBar}>
        <View style={styles.versionBadge}>
          <Text style={styles.versionBadgeText}>{activeVersion}</Text>
        </View>
        {fallbackNotice ? (
          <Text style={styles.fallbackText}>{fallbackNotice}</Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {verses.map((text, i) => {
          const verseNum = i + 1;
          return (
            <Pressable key={verseNum} onPress={() => openVerse(verseNum)}>
              <Text
                style={[
                  styles.verse,
                  highlighted[verseNum] ? { backgroundColor: highlighted[verseNum] } : null,
                ]}
              >
                <Text style={styles.verseNumber}>{verseNum} </Text>
                {text}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Verse action sheet */}
      <Modal
        visible={modalMode !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setModalMode(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModalMode(null)} />
        <View style={styles.sheet}>
          {modalMode === "actions" && selectedVerse != null && (
            <>
              <Text style={styles.sheetTitle}>
                {bookName} {chapter}:{selectedVerse}
              </Text>
              <Text style={styles.sheetSubtitle} numberOfLines={3}>
                {verses[selectedVerse - 1]}
              </Text>

              <Pressable style={styles.sheetAction} onPress={toggleHighlight}>
                <Text style={styles.sheetActionText}>
                  {highlighted[selectedVerse] ? "Remove highlight" : "Highlight verse"}
                </Text>
              </Pressable>
              <Pressable style={styles.sheetAction} onPress={() => setModalMode("note")}>
                <Text style={styles.sheetActionText}>Add a note</Text>
              </Pressable>
              <Pressable style={styles.sheetAction} onPress={runExplain}>
                <Text style={styles.sheetActionText}>Explain this verse (AI) ✨</Text>
              </Pressable>
              <Pressable style={styles.sheetAction} onPress={() => setModalMode(null)}>
                <Text style={[styles.sheetActionText, { color: colors.inkSoft }]}>Cancel</Text>
              </Pressable>
            </>
          )}

          {modalMode === "note" && (
            <>
              <Text style={styles.sheetTitle}>Add a note</Text>
              <TextInput
                style={styles.noteInput}
                multiline
                placeholder="Write your note…"
                placeholderTextColor={colors.inkSoft}
                value={noteText}
                onChangeText={setNoteText}
                autoFocus
              />
              <Pressable
                style={[styles.primaryButton, savingNote && { opacity: 0.6 }]}
                onPress={saveNote}
                disabled={savingNote}
              >
                {savingNote ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Save note</Text>
                )}
              </Pressable>
            </>
          )}

          {modalMode === "explain" && (
            <>
              <Text style={styles.sheetTitle}>AI Explanation</Text>
              {loadingExplanation ? (
                <ActivityIndicator color={colors.olive} style={{ marginVertical: spacing.lg }} />
              ) : explainError ? (
                <Text style={styles.error}>{explainError}</Text>
              ) : (
                <>
                  <ScrollView style={{ maxHeight: 320 }}>
                    <Text style={styles.explanationText}>{explanation}</Text>
                    {supportingScriptures.length > 0 && (
                      <>
                        <Text style={[styles.sheetTitle, { fontSize: 14, marginTop: spacing.md }]}>
                          Supporting Scriptures
                        </Text>
                        {supportingScriptures.map((s, i) => (
                          <Text key={i} style={styles.supportingScripture}>
                            {s.reference} — {s.note}
                          </Text>
                        ))}
                      </>
                    )}
                  </ScrollView>
                </>
              )}
              <Pressable style={[styles.primaryButton, { marginTop: spacing.md }]} onPress={() => setModalMode(null)}>
                <Text style={styles.primaryButtonText}>Close</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  centered: { alignItems: "center", justifyContent: "center" },
  metaBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
    gap: spacing.sm,
  },
  versionBadge: {
    backgroundColor: colors.olive,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  versionBadgeText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  fallbackText: { ...typography.caption, color: colors.terracotta, flex: 1 },
  content: { padding: spacing.lg },
  verse: { ...typography.body, color: colors.ink, marginBottom: spacing.sm, borderRadius: 4 },
  verseNumber: { color: colors.oliveLight, fontWeight: "700", fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
  },
  sheetTitle: { ...typography.title, color: colors.oliveDark, marginBottom: spacing.md, fontSize: 18 },
  sheetSubtitle: { ...typography.body, color: colors.inkSoft, marginBottom: spacing.md, fontSize: 14 },
  sheetAction: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
  },
  sheetActionText: { ...typography.body, color: colors.ink },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    borderRadius: radii.sm,
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: spacing.md,
    color: colors.ink,
  },
  primaryButton: {
    backgroundColor: colors.olive,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "700" },
  explanationText: { ...typography.body, color: colors.ink, marginBottom: spacing.md },
  supportingScripture: { ...typography.body, color: colors.inkSoft, marginBottom: spacing.xs },
  error: { color: colors.danger },
});
