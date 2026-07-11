import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { loadBibleBooks, type BibleBookMeta } from "../../data/bibleLoader";
import { colors, radii, spacing, typography } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "BookPicker">;

export default function BookPickerScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const [bibleBooks, setBibleBooks] = useState<BibleBookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBibleBooks()
      .then(setBibleBooks)
      .catch((e) => setError(e.message ?? "Couldn't load the Bible book list."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = bibleBooks.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()));
  const activeBook = bibleBooks.find((b) => b.id === selectedBook);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.olive} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.rowMeta}>{error}</Text>
      </View>
    );
  }

  if (activeBook) {
    const chapters = Array.from({ length: activeBook.chapterCount }, (_, i) => i + 1);
    return (
      <View style={styles.container}>
        <Pressable onPress={() => setSelectedBook(null)}>
          <Text style={styles.backLink}>‹ All books</Text>
        </Pressable>
        <Text style={styles.bookTitle}>{activeBook.name}</Text>
        <FlatList
          data={chapters}
          keyExtractor={(c) => String(c)}
          numColumns={5}
          contentContainerStyle={{ paddingTop: spacing.md }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.chapterChip}
              onPress={() =>
                navigation.navigate("ChapterReader", {
                  bookId: activeBook.id,
                  bookName: activeBook.name,
                  chapter: item,
                })
              }
            >
              <Text style={styles.chapterChipText}>{item}</Text>
            </Pressable>
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search books..."
        placeholderTextColor={colors.inkSoft}
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={filtered}
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setSelectedBook(item.id)}>
            <Text style={styles.rowText}>{item.name}</Text>
            <Text style={styles.rowMeta}>{item.chapterCount} ch.</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment, padding: spacing.lg },
  centered: { alignItems: "center", justifyContent: "center" },
  search: {
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
  },
  rowText: { ...typography.body, color: colors.ink },
  rowMeta: { ...typography.caption, color: colors.inkSoft },
  backLink: { color: colors.terracotta, fontWeight: "600", marginBottom: spacing.sm },
  bookTitle: { ...typography.title, color: colors.oliveDark, marginBottom: spacing.sm },
  chapterChip: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    alignItems: "center",
    justifyContent: "center",
    margin: spacing.xs,
  },
  chapterChipText: { ...typography.subtitle, color: colors.ink },
});
