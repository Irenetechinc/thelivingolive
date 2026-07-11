import React, { useMemo, useState } from "react";
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
import { getChapterVerses } from "../../data/bibleLoader";
import { supabase } from "../../lib/supabase";
import { explainVerse } from "../../lib/api";
import { colors, radii, spacing, typography } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ChapterReader">;

export default function ChapterReaderScreen({ route }: Props) {
  const { bookId, bookName, chapter } = route.params;
  const verses = useMemo(() => getChapterVerses(bookId, chapter), [bookId, chapter]);

  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState<Record<number, boolean>>({});
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [supportingScriptures, setSupportingScriptures] = useState<{ reference: string; note: string }[]>([]);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"actions" | "note" | "explain" | null>(null);

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
    setHighlighted((prev) => ({ ...prev, [selectedVerse]: isOn }));
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    if (isOn) {
      await supabase.from("highlights").insert({
        user_id: data.user.id,
        version: "KJV",
        book_id: bookId,
        book_name: bookName,
        chapter,
        verse: selectedVerse,
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
        version: "KJV",
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
        version: "KJV",
      });
      setExplanation(result.explanation);
      setSupportingScriptures(result.supportingScriptures ?? []);
    } catch (e: any) {
      setExplainError(e.message ?? "Couldn't generate an explanation right now.");
    } finally {
      setLoadingExplanation(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {verses.map((text, idx) => {
          const verseNum = idx + 1;
          const isHighlighted = highlighted[verseNum];
          return (
            <Pressable key={verseNum} onPress={() => openVerse(verseNum)}>
              <Text style={[styles.verse, isHighlighted && styles.verseHighlighted]}>
                <Text style={styles.verseNumber}>{verseNum} </Text>
                {text}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={modalMode !== null} transparent animationType="slide" onRequestClose={() => setModalMode(null)}>
        <Pressable style={styles.backdrop} onPress={() => setModalMode(null)} />
        <View style={styles.sheet}>
          {modalMode === "actions" && (
            <>
              <Text style={styles.sheetTitle}>
                {bookName} {chapter}:{selectedVerse}
              </Text>
              <Pressable style={styles.sheetAction} onPress={toggleHighlight}>
                <Text style={styles.sheetActionText}>
                  {selectedVerse != null && highlighted[selectedVerse] ? "Remove highlight" : "Highlight verse"}
                </Text>
              </Pressable>
              <Pressable style={styles.sheetAction} onPress={() => setModalMode("note")}>
                <Text style={styles.sheetActionText}>Add note</Text>
              </Pressable>
              <Pressable style={styles.sheetAction} onPress={runExplain}>
                <Text style={styles.sheetActionText}>Explain this verse (AI)</Text>
              </Pressable>
            </>
          )}

          {modalMode === "note" && (
            <>
              <Text style={styles.sheetTitle}>
                Note on {bookName} {chapter}:{selectedVerse}
              </Text>
              <TextInput
                style={styles.noteInput}
                placeholder="Write your note..."
                placeholderTextColor={colors.inkSoft}
                multiline
                value={noteText}
                onChangeText={setNoteText}
              />
              <Pressable style={styles.primaryButton} onPress={saveNote} disabled={savingNote}>
                {savingNote ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Save note</Text>}
              </Pressable>
            </>
          )}

          {modalMode === "explain" && (
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.sheetTitle}>
                {bookName} {chapter}:{selectedVerse}
              </Text>
              {loadingExplanation && <ActivityIndicator color={colors.olive} style={{ marginVertical: spacing.md }} />}
              {explainError && <Text style={styles.error}>{explainError}</Text>}
              {explanation && <Text style={styles.explanationText}>{explanation}</Text>}
              {supportingScriptures.length > 0 && (
                <View style={{ marginTop: spacing.md }}>
                  <Text style={styles.sheetSubtitle}>Supporting scriptures</Text>
                  {supportingScriptures.map((s, i) => (
                    <Text key={i} style={styles.supportingScripture}>
                      <Text style={{ fontWeight: "700" }}>{s.reference}</Text> — {s.note}
                    </Text>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  content: { padding: spacing.lg },
  verse: { ...typography.body, color: colors.ink, marginBottom: spacing.sm },
  verseHighlighted: { backgroundColor: "#F6E3A1" },
  verseNumber: { color: colors.oliveLight, fontWeight: "700", fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
  },
  sheetTitle: { ...typography.title, color: colors.oliveDark, marginBottom: spacing.md },
  sheetSubtitle: { ...typography.subtitle, color: colors.ink, marginBottom: spacing.xs },
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
  explanationText: { ...typography.body, color: colors.ink },
  supportingScripture: { ...typography.body, color: colors.inkSoft, marginBottom: spacing.xs },
  error: { color: colors.danger },
});
