import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  LayoutAnimation,
  UIManager,
  Platform,
  Animated,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import type { BibleVersion } from "./BibleHomeScreen";
import { loadChapterVerses } from "../../data/bibleLoader";
import { supabase } from "../../lib/supabase";
import { explainVerse, rateVerseExplanation } from "../../lib/api";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";
import FloatingNotesWidget from "../../components/FloatingNotesWidget";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type Props = NativeStackScreenProps<RootStackParamList, "ChapterReader">;

export default function ChapterReaderScreen({ route }: Props) {
  const { bookId, bookName, chapter, version: versionProp = "KJV" } = route.params;

  // ── Chapter data ─────────────────────────────────────────────────────────────
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

  // ── Highlights ───────────────────────────────────────────────────────────────
  const [highlighted, setHighlighted] = useState<Record<number, string>>({});
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

  // ── Action modal state ───────────────────────────────────────────────────────
  const [selectedVerse, setSelectedVerse] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [supportingScriptures, setSupportingScriptures] = useState<{ reference: string; note: string }[]>([]);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"actions" | "note" | "explain" | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // ── Study mode state ─────────────────────────────────────────────────────────
  const [studyMode, setStudyMode] = useState(false);
  const [studyVerseNum, setStudyVerseNum] = useState<number | null>(null);
  const [studyExplanation, setStudyExplanation] = useState<string | null>(null);
  const [studyScriptures, setStudyScriptures] = useState<{ reference: string; note: string }[]>([]);
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [studyRating, setStudyRating] = useState<number | null>(null);
  const [studyRatingSubmitted, setStudyRatingSubmitted] = useState(false);
  const [studySubmittingRating, setStudySubmittingRating] = useState(false);

  // Study mode pulse animation
  const studyPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!studyMode) {
      studyPulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(studyPulse, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(studyPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [studyMode]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function toggleStudyMode() {
    LayoutAnimation.configureNext({
      duration: 300,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    });
    setStudyMode((v) => !v);
    setStudyVerseNum(null);
    setStudyExplanation(null);
    setModalMode(null);
  }

  function openVerse(verseNumber: number) {
    if (studyMode) {
      if (studyVerseNum === verseNumber) {
        // Collapse
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setStudyVerseNum(null);
        setStudyExplanation(null);
      } else {
        // Expand new verse
        LayoutAnimation.configureNext({
          duration: 350,
          create: { type: "easeInEaseOut", property: "opacity" },
          update: { type: "spring", springDamping: 0.85 },
          delete: { type: "easeInEaseOut", property: "opacity" },
        });
        setStudyVerseNum(verseNumber);
        setStudyExplanation(null);
        setStudyError(null);
        setStudyRating(null);
        setStudyRatingSubmitted(false);
        runStudyExplain(verseNumber);
      }
      return;
    }
    // Normal mode — show action sheet
    setSelectedVerse(verseNumber);
    setModalMode("actions");
    setNoteText("");
    setExplanation(null);
    setExplainError(null);
    setUserRating(null);
    setRatingSubmitted(false);
  }

  async function runStudyExplain(verseNumber: number) {
    setStudyLoading(true);
    try {
      const result = await explainVerse({
        reference: `${bookName} ${chapter}:${verseNumber}`,
        text: verses[verseNumber - 1],
        version: activeVersion,
      });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStudyExplanation(result.explanation);
      setStudyScriptures(result.supportingScriptures ?? []);
    } catch (e: any) {
      setStudyError(e.message ?? "Couldn't generate explanation.");
    } finally {
      setStudyLoading(false);
    }
  }

  async function submitStudyRating(stars: number) {
    if (studySubmittingRating || studyRatingSubmitted || studyVerseNum == null) return;
    setStudyRating(stars);
    setStudySubmittingRating(true);
    try {
      await rateVerseExplanation({
        verseRef: `${bookName} ${chapter}:${studyVerseNum}`,
        rating: stars,
      });
      setStudyRatingSubmitted(true);
    } catch {
      // Non-fatal — stars stay selected
    } finally {
      setStudySubmittingRating(false);
    }
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

  async function submitRating(stars: number) {
    if (submittingRating || ratingSubmitted || selectedVerse == null) return;
    setUserRating(stars);
    setSubmittingRating(true);
    try {
      const verseRef = `${bookName} ${chapter}:${selectedVerse}`;
      await rateVerseExplanation({ verseRef, rating: stars });
      setRatingSubmitted(true);
    } catch {
      // Non-fatal
    } finally {
      setSubmittingRating(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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
      {/* Meta bar */}
      <View style={[styles.metaBar, studyMode && styles.metaBarStudy]}>
        <View style={styles.metaBarLeft}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionBadgeText}>{activeVersion}</Text>
          </View>
          {fallbackNotice ? (
            <Text style={styles.fallbackText} numberOfLines={1}>{fallbackNotice}</Text>
          ) : null}
        </View>

        {/* Study mode toggle */}
        <Pressable
          style={({ pressed }) => [
            styles.studyToggle,
            studyMode && styles.studyToggleActive,
            pressed && { opacity: 0.8 },
          ]}
          onPress={toggleStudyMode}
        >
          <Animated.Text style={[styles.studyToggleIcon, studyMode && { transform: [{ scale: studyPulse }] }]}>
            {studyMode ? "📖" : "📖"}
          </Animated.Text>
          <Text style={[styles.studyToggleText, studyMode && styles.studyToggleTextActive]}>
            {studyMode ? "Study ON" : "Study"}
          </Text>
        </Pressable>
      </View>

      {studyMode && (
        <View style={styles.studyBanner}>
          <Text style={styles.studyBannerText}>
            ✦ Study Mode — tap any verse to explore its meaning
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {verses.map((text, i) => {
          const verseNum = i + 1;
          const isStudyExpanded = studyMode && studyVerseNum === verseNum;

          return (
            <View key={verseNum}>
              <Pressable
                onPress={() => openVerse(verseNum)}
                style={({ pressed }) => [
                  styles.versePressable,
                  studyMode && styles.versePressableStudy,
                  isStudyExpanded && styles.versePressableExpanded,
                  pressed && styles.versePressablePressed,
                ]}
              >
                <Text
                  style={[
                    styles.verse,
                    highlighted[verseNum] ? { backgroundColor: highlighted[verseNum] } : null,
                    studyMode && styles.verseStudy,
                    isStudyExpanded && styles.verseExpanded,
                  ]}
                >
                  <Text style={[styles.verseNumber, isStudyExpanded && styles.verseNumberExpanded]}>
                    {verseNum}{" "}
                  </Text>
                  {text}
                </Text>
              </Pressable>

              {/* Inline study panel */}
              {isStudyExpanded && (
                <View style={styles.studyPanel}>
                  {studyLoading ? (
                    <View style={styles.studyLoadingWrap}>
                      <ActivityIndicator color={colors.olive} />
                      <Text style={styles.studyLoadingText}>Exploring the scriptures…</Text>
                    </View>
                  ) : studyError ? (
                    <Text style={styles.studyError}>{studyError}</Text>
                  ) : (
                    <>
                      {/* Insight header */}
                      <View style={styles.studyInsightHeader}>
                        <Text style={styles.studyInsightIcon}>✦</Text>
                        <Text style={styles.studyInsightTitle}>Spiritual Insight</Text>
                      </View>

                      <Text style={styles.studyExplanationText}>{studyExplanation}</Text>

                      {/* Supporting scriptures */}
                      {studyScriptures.length > 0 && (
                        <>
                          <View style={styles.studySeeAlsoHeader}>
                            <View style={styles.studyDivider} />
                            <Text style={styles.studySeeAlsoLabel}>SEE ALSO</Text>
                            <View style={styles.studyDivider} />
                          </View>
                          {studyScriptures.map((s, idx) => (
                            <View key={idx} style={styles.studyScriptureCard}>
                              <Text style={styles.studyScriptureRef}>{s.reference}</Text>
                              <Text style={styles.studyScriptureNote}>{s.note}</Text>
                            </View>
                          ))}
                        </>
                      )}

                      {/* Star rating */}
                      <View style={styles.studyRatingWrap}>
                        {studyRatingSubmitted ? (
                          <Text style={styles.studyRatingThanks}>Thanks for your feedback 🙏</Text>
                        ) : (
                          <>
                            <Text style={styles.studyRatingLabel}>Was this insight helpful?</Text>
                            <View style={styles.studyStarsRow}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Pressable
                                  key={star}
                                  onPress={() => submitStudyRating(star)}
                                  disabled={studySubmittingRating}
                                  hitSlop={6}
                                >
                                  <Text style={[
                                    styles.studyStar,
                                    (studyRating ?? 0) >= star && styles.studyStarFilled,
                                  ]}>
                                    {(studyRating ?? 0) >= star ? "★" : "☆"}
                                  </Text>
                                </Pressable>
                              ))}
                              {studySubmittingRating && (
                                <ActivityIndicator
                                  color={colors.olive}
                                  size="small"
                                  style={{ marginLeft: spacing.sm }}
                                />
                              )}
                            </View>
                          </>
                        )}
                      </View>
                    </>
                  )}

                  {/* Collapse button */}
                  <Pressable
                    style={styles.studyCollapseBtn}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setStudyVerseNum(null);
                    }}
                  >
                    <Text style={styles.studyCollapseBtnText}>▲ Close insight</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Verse action sheet modal (normal mode only) */}
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
                <Text style={styles.sheetActionText}>Explain this verse ✨</Text>
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
              <Text style={styles.sheetTitle}>Spiritual Insight</Text>
              {loadingExplanation ? (
                <ActivityIndicator color={colors.olive} style={{ marginVertical: spacing.lg }} />
              ) : explainError ? (
                <Text style={styles.error}>{explainError}</Text>
              ) : (
                <>
                  <ScrollView style={{ maxHeight: 280 }}>
                    <Text style={styles.explanationText}>{explanation}</Text>
                    {supportingScriptures.length > 0 && (
                      <>
                        <Text style={[styles.sheetTitle, { fontSize: 14, marginTop: spacing.md }]}>
                          Supporting Scriptures
                        </Text>
                        {supportingScriptures.map((s, idx) => (
                          <Text key={idx} style={styles.supportingScripture}>
                            {s.reference} — {s.note}
                          </Text>
                        ))}
                      </>
                    )}
                  </ScrollView>

                  {/* Star rating in modal */}
                  <View style={styles.ratingContainer}>
                    {ratingSubmitted ? (
                      <Text style={styles.ratingThanks}>Thanks for your feedback 🙏</Text>
                    ) : (
                      <>
                        <Text style={styles.ratingLabel}>Was this insight helpful?</Text>
                        <View style={styles.starsRow}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Pressable
                              key={star}
                              onPress={() => submitRating(star)}
                              disabled={submittingRating}
                              style={styles.starButton}
                            >
                              <Text style={[
                                styles.starText,
                                (userRating ?? 0) >= star && styles.starFilled,
                              ]}>
                                {(userRating ?? 0) >= star ? "★" : "☆"}
                              </Text>
                            </Pressable>
                          ))}
                          {submittingRating && (
                            <ActivityIndicator color={colors.olive} size="small" style={{ marginLeft: spacing.sm }} />
                          )}
                        </View>
                      </>
                    )}
                  </View>
                </>
              )}
              <Pressable
                style={[styles.primaryButton, { marginTop: spacing.md }]}
                onPress={() => setModalMode(null)}
              >
                <Text style={styles.primaryButtonText}>Close</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>

      <FloatingNotesWidget
        bookId={bookId}
        bookName={bookName}
        chapter={chapter}
        version={activeVersion}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  centered: { alignItems: "center", justifyContent: "center" },

  // ── Meta bar ────────────────────────────────────────────
  metaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
    backgroundColor: colors.white,
  },
  metaBarStudy: { backgroundColor: "#EDF2E0", borderBottomColor: "#C2D4A0" },
  metaBarLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 },
  versionBadge: {
    backgroundColor: colors.olive,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  versionBadgeText: { color: colors.white, fontSize: 12, fontWeight: "700" },
  fallbackText: { ...typography.caption, color: colors.terracotta, flex: 1 },

  // Study mode toggle
  studyToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.parchmentDark,
    borderRadius: radii.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  studyToggleActive: {
    backgroundColor: "#EDF2E0",
    borderColor: colors.olive,
  },
  studyToggleIcon: { fontSize: 14 },
  studyToggleText: { fontSize: 12, fontWeight: "700", color: colors.inkSoft },
  studyToggleTextActive: { color: colors.oliveDark },

  // Study banner
  studyBanner: {
    backgroundColor: "#EDF2E0",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#C2D4A0",
    alignItems: "center",
  },
  studyBannerText: { ...typography.caption, color: colors.olive, fontStyle: "italic" },

  // ── Verse list ───────────────────────────────────────────
  content: { padding: spacing.lg, paddingBottom: spacing.xl * 3 },

  versePressable: { borderRadius: 6, marginBottom: spacing.sm },
  versePressableStudy: {
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
    paddingLeft: spacing.sm,
    borderRadius: 0,
  },
  versePressableExpanded: {
    borderLeftColor: colors.olive,
    backgroundColor: "#EDF2E0",
    borderRadius: 6,
    paddingLeft: spacing.sm,
  },
  versePressablePressed: { opacity: 0.75 },

  verse: { ...typography.body, color: colors.ink, borderRadius: 4 },
  verseStudy: { color: colors.ink },
  verseExpanded: { fontWeight: "600", color: colors.oliveDark },
  verseNumber: { color: colors.oliveLight, fontWeight: "700", fontSize: 12 },
  verseNumberExpanded: { color: colors.olive, fontSize: 13 },

  // ── Study panel ──────────────────────────────────────────
  studyPanel: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    marginTop: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#C2D4A0",
    ...shadows.card,
  },
  studyLoadingWrap: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  studyLoadingText: { ...typography.caption, color: colors.inkSoft, fontStyle: "italic" },
  studyError: { ...typography.caption, color: colors.terracotta, padding: spacing.lg },

  studyInsightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: "#F0F4E8",
    borderBottomWidth: 1,
    borderBottomColor: "#C2D4A0",
  },
  studyInsightIcon: { fontSize: 12, color: colors.olive },
  studyInsightTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.oliveDark,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  studyExplanationText: {
    ...typography.body,
    color: colors.ink,
    lineHeight: 24,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },

  studySeeAlsoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  studyDivider: { flex: 1, height: 1, backgroundColor: colors.parchmentDark },
  studySeeAlsoLabel: {
    ...typography.micro,
    color: colors.inkSoft,
    letterSpacing: 1.5,
    fontWeight: "700",
  },

  studyScriptureCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
  },
  studyScriptureRef: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.oliveDark,
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  studyScriptureNote: { ...typography.caption, color: colors.ink, lineHeight: 18 },

  studyRatingWrap: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.parchmentDark,
  },
  studyRatingLabel: { ...typography.caption, color: colors.inkSoft, marginBottom: spacing.sm },
  studyStarsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  studyStar: { fontSize: 26, color: colors.parchmentDark },
  studyStarFilled: { color: "#D4A017" },
  studyRatingThanks: { ...typography.caption, color: colors.olive, fontWeight: "700", fontStyle: "italic" },

  studyCollapseBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.parchmentDark,
    marginTop: spacing.xs,
  },
  studyCollapseBtnText: { ...typography.caption, color: colors.inkSoft },

  // ── Action modal ─────────────────────────────────────────
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
  error: { color: colors.terracotta },

  // Star rating in explain modal
  ratingContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.parchmentDark,
    alignItems: "center",
  },
  ratingLabel: { ...typography.caption, color: colors.inkSoft, marginBottom: spacing.sm },
  starsRow: { flexDirection: "row", alignItems: "center" },
  starButton: { paddingHorizontal: spacing.xs },
  starText: { fontSize: 28, color: colors.parchmentDark },
  starFilled: { color: "#D4A017" },
  ratingThanks: { ...typography.body, color: colors.olive, fontWeight: "600" },
});
