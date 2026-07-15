import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  UIManager,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { loadBibleBooks, type BibleBookMeta } from "../../data/bibleLoader";
import { kjvBooks } from "../../data/bible/kjvBooks";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";
import type { BibleVersion } from "./BibleHomeScreen";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const OT_MAX_ID = 39;

type Props = NativeStackScreenProps<RootStackParamList, "BookPicker">;

type PickerModal = "ot" | "nt" | "chapter" | "verse" | null;

function getVerseCount(bookId: number, chapter: number): number {
  const bookData = kjvBooks[bookId];
  if (!bookData) return 30;
  const chapterData = bookData[chapter - 1];
  return chapterData ? chapterData.length : 30;
}

function getChapterCount(books: BibleBookMeta[], bookId: number): number {
  return books.find((b) => b.id === bookId)?.chapterCount ?? 1;
}

export default function BookPickerScreen({ navigation, route }: Props) {
  const version: BibleVersion = route.params?.version ?? "KJV";

  const [bibleBooks, setBibleBooks] = useState<BibleBookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected state
  const [selectedBook, setSelectedBook] = useState<BibleBookMeta | null>(null);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [selectedVerse, setSelectedVerse] = useState(1);

  // Which modal is open
  const [openModal, setOpenModal] = useState<PickerModal>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadBibleBooks()
      .then(setBibleBooks)
      .catch((e) => setError(e.message ?? "Couldn't load books."))
      .finally(() => setLoading(false));
  }, []);

  const otBooks = bibleBooks.filter((b) => b.id <= OT_MAX_ID);
  const ntBooks = bibleBooks.filter((b) => b.id > OT_MAX_ID);

  const chapterCount = selectedBook
    ? getChapterCount(bibleBooks, selectedBook.id)
    : 1;
  const verseCount = selectedBook
    ? getVerseCount(selectedBook.id, selectedChapter)
    : 1;

  function selectBook(book: BibleBookMeta) {
    setSelectedBook(book);
    setSelectedChapter(1);
    setSelectedVerse(1);
    setOpenModal(null);
    setSearchQuery("");
  }

  function locate() {
    if (!selectedBook) return;
    navigation.navigate("ChapterReader", {
      bookId: selectedBook.id,
      bookName: selectedBook.name,
      chapter: selectedChapter,
      version,
      initialVerse: selectedVerse,
    });
  }

  // ─── Loading / error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.olive} size="large" />
        <Text style={styles.loadingText}>Opening the scriptures…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const filteredBooks = (openModal === "ot" ? otBooks : ntBooks).filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isNT = selectedBook ? selectedBook.id > OT_MAX_ID : false;
  const selectedTestamentLabel = selectedBook
    ? isNT
      ? "NT"
      : "OT"
    : null;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#1F2B12", "#2E3A1F", "#4A5A36"]}
        style={styles.header}
      >
        <View style={styles.versionPill}>
          <Text style={styles.versionPillText}>{version}</Text>
        </View>
        <Text style={styles.headerTitle}>Locator</Text>
        <Text style={styles.headerSub}>
          Jump to any book · chapter · verse
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Locator Card */}
        <View style={styles.card}>
          {/* Row 1: OT | NT */}
          <View style={styles.testamentRow}>
            {/* OT Button */}
            <Pressable
              style={({ pressed }) => [
                styles.testamentBtn,
                selectedBook && !isNT && styles.testamentBtnActive,
                pressed && styles.testamentBtnPressed,
              ]}
              onPress={() => {
                setSearchQuery("");
                setOpenModal("ot");
              }}
            >
              <Text
                style={[
                  styles.testamentBtnLabel,
                  selectedBook && !isNT && styles.testamentBtnLabelActive,
                ]}
              >
                {selectedBook && !isNT ? selectedBook.name : "OT"}
              </Text>
              <Text
                style={[
                  styles.testamentBtnArrow,
                  selectedBook && !isNT && styles.testamentBtnArrowActive,
                ]}
              >
                ▾
              </Text>
            </Pressable>

            <View style={styles.testamentDivider} />

            {/* NT Button */}
            <Pressable
              style={({ pressed }) => [
                styles.testamentBtn,
                selectedBook && isNT && styles.testamentBtnActive,
                pressed && styles.testamentBtnPressed,
              ]}
              onPress={() => {
                setSearchQuery("");
                setOpenModal("nt");
              }}
            >
              <Text
                style={[
                  styles.testamentBtnLabel,
                  selectedBook && isNT && styles.testamentBtnLabelActive,
                ]}
              >
                {selectedBook && isNT ? selectedBook.name : "NT"}
              </Text>
              <Text
                style={[
                  styles.testamentBtnArrow,
                  selectedBook && isNT && styles.testamentBtnArrowActive,
                ]}
              >
                ▾
              </Text>
            </Pressable>
          </View>

          <View style={styles.cardDivider} />

          {/* Row 2: Chapter */}
          <Pressable
            style={({ pressed }) => [
              styles.pickerRow,
              pressed && styles.pickerRowPressed,
              !selectedBook && styles.pickerRowDisabled,
            ]}
            onPress={() => selectedBook && setOpenModal("chapter")}
            disabled={!selectedBook}
          >
            <Text style={styles.pickerLabel}>Chapter</Text>
            <View style={styles.pickerValueWrap}>
              <Text style={styles.pickerValue}>{selectedChapter}</Text>
              <Text style={styles.pickerArrow}>▾</Text>
            </View>
          </Pressable>

          <View style={styles.cardDividerLight} />

          {/* Row 3: Verse */}
          <Pressable
            style={({ pressed }) => [
              styles.pickerRow,
              pressed && styles.pickerRowPressed,
              !selectedBook && styles.pickerRowDisabled,
            ]}
            onPress={() => selectedBook && setOpenModal("verse")}
            disabled={!selectedBook}
          >
            <Text style={styles.pickerLabel}>Verse</Text>
            <View style={styles.pickerValueWrap}>
              <Text style={styles.pickerValue}>{selectedVerse}</Text>
              <Text style={styles.pickerArrow}>▾</Text>
            </View>
          </Pressable>
        </View>

        {/* Selected book hint */}
        {selectedBook && (
          <Text style={styles.hint}>
            {selectedBook.name} · {selectedBook.chapterCount} chapters ·{" "}
            {selectedTestamentLabel === "OT"
              ? "Old Testament"
              : "New Testament"}
          </Text>
        )}
        {!selectedBook && (
          <Text style={styles.hint}>
            Tap OT or NT to choose a book
          </Text>
        )}

        {/* Locate button */}
        <Pressable
          style={({ pressed }) => [
            styles.locateBtn,
            !selectedBook && styles.locateBtnDisabled,
            pressed && selectedBook && styles.locateBtnPressed,
          ]}
          onPress={locate}
          disabled={!selectedBook}
        >
          <Text style={styles.locateBtnIcon}>⊕</Text>
          <Text
            style={[
              styles.locateBtnText,
              !selectedBook && styles.locateBtnTextDisabled,
            ]}
          >
            Locate
          </Text>
        </Pressable>
      </ScrollView>

      {/* ── Book Picker Modal (OT / NT) ─────────────────────────────────── */}
      <Modal
        visible={openModal === "ot" || openModal === "nt"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setOpenModal(null);
          setSearchQuery("");
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {openModal === "ot" ? "Old Testament" : "New Testament"}
            </Text>
            <Pressable
              onPress={() => {
                setOpenModal(null);
                setSearchQuery("");
              }}
              hitSlop={12}
            >
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.modalSearchWrap}>
            <TextInput
              style={styles.modalSearch}
              placeholder="Search books…"
              placeholderTextColor={colors.inkSoft}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
          </View>

          <FlatList
            data={filteredBooks}
            keyExtractor={(b) => String(b.id)}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.bookRow,
                  selectedBook?.id === item.id && styles.bookRowSelected,
                  pressed && styles.bookRowPressed,
                ]}
                onPress={() => selectBook(item)}
              >
                <View style={styles.bookRowLeft}>
                  <Text style={styles.bookIndex}>{item.id}</Text>
                  <Text
                    style={[
                      styles.bookName,
                      selectedBook?.id === item.id && styles.bookNameSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                </View>
                <Text style={styles.bookChCount}>{item.chapterCount} ch</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.noResults}>
                No books match "{searchQuery}"
              </Text>
            }
          />
        </View>
      </Modal>

      {/* ── Chapter Picker Modal ────────────────────────────────────────── */}
      <Modal
        visible={openModal === "chapter"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpenModal(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedBook?.name ?? "Chapter"}
            </Text>
            <Pressable onPress={() => setOpenModal(null)} hitSlop={12}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>
          <FlatList
            data={Array.from({ length: chapterCount }, (_, i) => i + 1)}
            keyExtractor={(c) => String(c)}
            numColumns={5}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.numberGrid}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.numberTile,
                  selectedChapter === item && styles.numberTileSelected,
                  pressed && styles.numberTilePressed,
                ]}
                onPress={() => {
                  setSelectedChapter(item);
                  setSelectedVerse(1);
                  setOpenModal(null);
                }}
              >
                <Text
                  style={[
                    styles.numberTileText,
                    selectedChapter === item && styles.numberTileTextSelected,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* ── Verse Picker Modal ──────────────────────────────────────────── */}
      <Modal
        visible={openModal === "verse"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpenModal(null)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedBook?.name} {selectedChapter} · Verse
            </Text>
            <Pressable onPress={() => setOpenModal(null)} hitSlop={12}>
              <Text style={styles.modalClose}>✕</Text>
            </Pressable>
          </View>
          <FlatList
            data={Array.from({ length: verseCount }, (_, i) => i + 1)}
            keyExtractor={(v) => String(v)}
            numColumns={5}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.numberGrid}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.numberTile,
                  selectedVerse === item && styles.numberTileSelected,
                  pressed && styles.numberTilePressed,
                ]}
                onPress={() => {
                  setSelectedVerse(item);
                  setOpenModal(null);
                }}
              >
                <Text
                  style={[
                    styles.numberTileText,
                    selectedVerse === item && styles.numberTileTextSelected,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  centered: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: {
    ...typography.caption,
    color: colors.inkSoft,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.terracotta,
    textAlign: "center",
    padding: spacing.lg,
  },

  // ── Header ────────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  versionPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  versionPillText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.3,
  },
  headerSub: {
    ...typography.caption,
    color: "rgba(255,255,255,0.5)",
    marginTop: 3,
    letterSpacing: 0.5,
  },

  // ── Body ──────────────────────────────────────────────────────────────────────
  body: {
    padding: spacing.lg,
    alignItems: "stretch",
  },

  // ── Locator Card ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    overflow: "hidden",
    ...shadows.card,
  },

  // OT | NT row
  testamentRow: {
    flexDirection: "row",
    height: 72,
  },
  testamentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.white,
  },
  testamentBtnActive: {
    backgroundColor: "#F0F5E8",
  },
  testamentBtnPressed: {
    backgroundColor: "#EAF0E0",
  },
  testamentBtnLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
    flexShrink: 1,
    maxWidth: "80%",
  },
  testamentBtnLabelActive: {
    color: colors.oliveDark,
    fontSize: 15,
    fontWeight: "700",
  },
  testamentBtnArrow: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },
  testamentBtnArrowActive: {
    color: colors.olive,
  },
  testamentDivider: {
    width: 1,
    backgroundColor: colors.parchmentDark,
    marginVertical: spacing.md,
  },

  cardDivider: {
    height: 1.5,
    backgroundColor: colors.parchmentDark,
  },
  cardDividerLight: {
    height: 1,
    backgroundColor: colors.parchmentDark,
    marginHorizontal: spacing.lg,
  },

  // Picker rows (Chapter / Verse)
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    backgroundColor: colors.white,
  },
  pickerRowPressed: {
    backgroundColor: "#F8F8F5",
  },
  pickerRowDisabled: {
    opacity: 0.4,
  },
  pickerLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.ink,
  },
  pickerValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pickerValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.oliveDark,
    minWidth: 28,
    textAlign: "right",
  },
  pickerArrow: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },

  // ── Hint ─────────────────────────────────────────────────────────────────────
  hint: {
    ...typography.caption,
    color: colors.inkSoft,
    textAlign: "center",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },

  // ── Locate button ─────────────────────────────────────────────────────────────
  locateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: colors.olive,
    borderRadius: radii.pill,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    alignSelf: "center",
    ...shadows.card,
  },
  locateBtnDisabled: {
    backgroundColor: colors.parchmentDark,
    ...shadows.subtle,
  },
  locateBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  locateBtnIcon: {
    fontSize: 22,
    color: colors.white,
  },
  locateBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: 0.2,
  },
  locateBtnTextDisabled: {
    color: colors.inkSoft,
  },

  // ── Modals ────────────────────────────────────────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: colors.parchment,
    paddingTop: spacing.sm,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.parchmentDark,
    alignSelf: "center",
    marginBottom: spacing.sm,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  modalClose: {
    fontSize: 18,
    color: colors.inkSoft,
    fontWeight: "400",
  },
  modalSearchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
  },
  modalSearch: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    color: colors.ink,
    fontSize: 15,
    ...shadows.subtle,
  },
  bookRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
    backgroundColor: colors.white,
  },
  bookRowSelected: {
    backgroundColor: "#EDF2E0",
  },
  bookRowPressed: {
    backgroundColor: "#F5F5EE",
  },
  bookRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  bookIndex: {
    width: 26,
    fontSize: 11,
    fontWeight: "700",
    color: colors.inkFaint,
    textAlign: "right",
  },
  bookName: {
    ...typography.body,
    color: colors.ink,
    fontWeight: "500",
  },
  bookNameSelected: {
    color: colors.oliveDark,
    fontWeight: "700",
  },
  bookChCount: {
    ...typography.caption,
    color: colors.olive,
    fontWeight: "600",
  },
  noResults: {
    ...typography.caption,
    color: colors.inkSoft,
    padding: spacing.lg,
    fontStyle: "italic",
    textAlign: "center",
  },

  // ── Number grids (chapter / verse pickers) ────────────────────────────────────
  numberGrid: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  numberTile: {
    flex: 1,
    margin: spacing.xs,
    aspectRatio: 1,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    ...shadows.subtle,
  },
  numberTileSelected: {
    backgroundColor: colors.oliveDark,
    borderColor: colors.oliveDark,
  },
  numberTilePressed: {
    backgroundColor: "#EDF2E0",
    borderColor: colors.olive,
  },
  numberTileText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  numberTileTextSelected: {
    color: colors.white,
  },
});
