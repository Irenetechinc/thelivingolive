import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Animated,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { loadBibleBooks, type BibleBookMeta } from "../../data/bibleLoader";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";
import type { BibleVersion } from "./BibleHomeScreen";

if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// Standard canon split: 1–39 = Old Testament, 40–66 = New Testament
const OT_MAX_ID = 39;

type Props = NativeStackScreenProps<RootStackParamList, "BookPicker">;

export default function BookPickerScreen({ navigation, route }: Props) {
  const version: BibleVersion = route.params?.version ?? "KJV";

  const [query, setQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<BibleBookMeta | null>(null);
  const [bibleBooks, setBibleBooks] = useState<BibleBookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otOpen, setOtOpen] = useState(true);
  const [ntOpen, setNtOpen] = useState(false);

  // Fade-in animation for the chapter grid
  const chapterFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadBibleBooks()
      .then(setBibleBooks)
      .catch((e) => setError(e.message ?? "Couldn't load the Bible book list."))
      .finally(() => setLoading(false));
  }, []);

  const ot = bibleBooks.filter((b) => b.id <= OT_MAX_ID);
  const nt = bibleBooks.filter((b) => b.id > OT_MAX_ID);
  const sq = query.toLowerCase();
  const filteredOt = ot.filter((b) => b.name.toLowerCase().includes(sq));
  const filteredNt = nt.filter((b) => b.name.toLowerCase().includes(sq));
  const isSearching = query.length > 0;

  function toggleSection(section: "ot" | "nt") {
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: "easeInEaseOut", property: "opacity" },
      update: { type: "easeInEaseOut" },
      delete: { type: "easeInEaseOut", property: "opacity" },
    });
    if (section === "ot") setOtOpen((v) => !v);
    else setNtOpen((v) => !v);
  }

  function openBook(book: BibleBookMeta) {
    chapterFade.setValue(0);
    setSelectedBook(book);
    Animated.spring(chapterFade, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }

  function goBackToBooks() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedBook(null);
  }

  // ─── Loading / error states ──────────────────────────────────────────────────

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

  // ─── Chapter grid ────────────────────────────────────────────────────────────

  if (selectedBook) {
    const chapters = Array.from({ length: selectedBook.chapterCount }, (_, i) => i + 1);
    const isNT = selectedBook.id > OT_MAX_ID;
    return (
      <Animated.View style={[styles.container, { opacity: chapterFade }]}>
        <LinearGradient colors={["#1F2B12", "#2E3A1F", "#3E4A2F"]} style={styles.chapterHeader}>
          <Pressable onPress={goBackToBooks} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backBtnText}>‹ All books</Text>
          </Pressable>
          <Text style={styles.chapterBookName}>{selectedBook.name}</Text>
          <Text style={styles.chapterBookSub}>
            {isNT ? "New Testament" : "Old Testament"} · {selectedBook.chapterCount} chapters · {version}
          </Text>
        </LinearGradient>

        <FlatList
          key="chapters-grid"
          data={chapters}
          keyExtractor={(c) => String(c)}
          numColumns={4}
          contentContainerStyle={styles.chapterGrid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.chapterTile, pressed && styles.chapterTilePressed]}
              onPress={() =>
                navigation.navigate("ChapterReader", {
                  bookId: selectedBook.id,
                  bookName: selectedBook.name,
                  chapter: item,
                  version,
                })
              }
            >
              <Text style={styles.chapterTileNum}>{item}</Text>
            </Pressable>
          )}
        />
      </Animated.View>
    );
  }

  // ─── Book list with OT/NT accordion ─────────────────────────────────────────

  const renderBook = (book: BibleBookMeta) => (
    <Pressable
      key={book.id}
      style={({ pressed }) => [styles.bookRow, pressed && styles.bookRowPressed]}
      onPress={() => openBook(book)}
    >
      <View style={styles.bookRowLeft}>
        <Text style={styles.bookId}>{book.id}</Text>
        <Text style={styles.bookName}>{book.name}</Text>
      </View>
      <Text style={styles.bookChCount}>{book.chapterCount} ch ›</Text>
    </Pressable>
  );

  const renderSection = (
    title: string,
    books: BibleBookMeta[],
    open: boolean,
    section: "ot" | "nt"
  ) => {
    const fullCount = section === "ot" ? ot.length : nt.length;
    return (
      <View style={styles.sectionWrap}>
        <Pressable
          style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.85 }]}
          onPress={() => toggleSection(section)}
        >
          <View style={styles.sectionHeaderLeft}>
            <Text style={styles.sectionArrow}>{open ? "▾" : "▸"}</Text>
            <View>
              <Text style={styles.sectionTitle}>{title}</Text>
              <Text style={styles.sectionMeta}>{fullCount} books</Text>
            </View>
          </View>
          <View style={[styles.testamentTag, section === "nt" && styles.testamentTagNT]}>
            <Text style={styles.testamentTagText}>{section === "ot" ? "OT" : "NT"}</Text>
          </View>
        </Pressable>

        {open && (
          <View style={styles.sectionBooks}>
            {books.length === 0 && isSearching ? (
              <Text style={styles.noResults}>No books match "{query}"</Text>
            ) : (
              books.map(renderBook)
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={["#1F2B12", "#2E3A1F", "#4A5A36"]} style={styles.header}>
        <View style={styles.versionPill}>
          <Text style={styles.versionPillText}>{version}</Text>
        </View>
        <Text style={styles.headerTitle}>Choose a Book</Text>
        <Text style={styles.headerSub}>66 books · Old &amp; New Testament</Text>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            placeholder="Search books…"
            placeholderTextColor={colors.inkSoft}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
        </View>

        {isSearching ? (
          // Flat search results grouped by testament
          <View>
            {filteredOt.length > 0 && (
              <View style={styles.sectionWrap}>
                <Text style={styles.searchGroupLabel}>OLD TESTAMENT</Text>
                {filteredOt.map(renderBook)}
              </View>
            )}
            {filteredNt.length > 0 && (
              <View style={styles.sectionWrap}>
                <Text style={styles.searchGroupLabel}>NEW TESTAMENT</Text>
                {filteredNt.map(renderBook)}
              </View>
            )}
            {filteredOt.length === 0 && filteredNt.length === 0 && (
              <Text style={styles.noResults}>No books match "{query}"</Text>
            )}
          </View>
        ) : (
          // Accordion
          <View>
            {renderSection("Old Testament", filteredOt, otOpen, "ot")}
            {renderSection("New Testament", filteredNt, ntOpen, "nt")}
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  centered: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { ...typography.caption, color: colors.inkSoft, marginTop: spacing.sm },
  errorText: { ...typography.body, color: colors.terracotta, textAlign: "center", padding: spacing.lg },

  // ── Header ──────────────────────────────────────────────
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
  versionPillText: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: colors.white, letterSpacing: -0.3 },
  headerSub: { ...typography.caption, color: "rgba(255,255,255,0.5)", marginTop: 3, letterSpacing: 0.5 },

  // ── Search ───────────────────────────────────────────────
  searchWrap: { padding: spacing.lg, paddingBottom: spacing.sm },
  search: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    color: colors.ink,
    fontSize: 15,
    ...shadows.subtle,
  },

  // ── Section accordion ────────────────────────────────────
  sectionWrap: { marginBottom: spacing.xs },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.parchment,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionArrow: { fontSize: 14, color: colors.olive, width: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.oliveDark },
  sectionMeta: { ...typography.micro, color: colors.inkSoft, marginTop: 1, letterSpacing: 0.5 },
  testamentTag: {
    backgroundColor: colors.olive,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  testamentTagNT: { backgroundColor: colors.terracotta },
  testamentTagText: { color: colors.white, fontSize: 11, fontWeight: "700" },

  sectionBooks: { backgroundColor: colors.white },
  searchGroupLabel: {
    ...typography.micro,
    color: colors.inkSoft,
    letterSpacing: 1.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.parchment,
  },
  noResults: {
    ...typography.caption,
    color: colors.inkSoft,
    padding: spacing.lg,
    fontStyle: "italic",
  },

  // ── Book rows ────────────────────────────────────────────
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
  bookRowPressed: { backgroundColor: "#F0F4E8" },
  bookRowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bookId: {
    width: 26,
    fontSize: 11,
    fontWeight: "700",
    color: colors.inkFaint,
    textAlign: "right",
  },
  bookName: { ...typography.body, color: colors.ink, fontWeight: "500" },
  bookChCount: { ...typography.caption, color: colors.olive, fontWeight: "600" },

  // ── Chapter grid ─────────────────────────────────────────
  chapterHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  backBtn: { alignSelf: "flex-start", marginBottom: spacing.md },
  backBtnText: { color: "rgba(255,255,255,0.75)", fontWeight: "600", fontSize: 15 },
  chapterBookName: { fontSize: 28, fontWeight: "800", color: colors.white, letterSpacing: -0.5 },
  chapterBookSub: { ...typography.caption, color: "rgba(255,255,255,0.5)", marginTop: 4, letterSpacing: 0.5 },
  chapterGrid: { padding: spacing.md, gap: spacing.sm },
  chapterTile: {
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
  chapterTilePressed: { backgroundColor: "#EDF2E0", borderColor: colors.olive, transform: [{ scale: 0.94 }] },
  chapterTileNum: { fontSize: 17, fontWeight: "700", color: colors.ink },
});
