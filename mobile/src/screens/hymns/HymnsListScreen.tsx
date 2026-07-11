import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { searchHymns } from "../../data/hymns";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "HymnsList">;

export default function HymnsListScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHymns(query), [query]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#2E3A1F", "#3E4A2F", "#4A5A36"]}
        style={styles.header}
      >
        <Text style={styles.headerEyebrow}>DIGITAL HYMNBOOK</Text>
        <Text style={styles.headerTitle}>55 Sacred Hymns</Text>
        <Text style={styles.headerSub}>Public domain · Pre-1929 · Full lyrics</Text>

        {/* Search inside header */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title, author, or lyric…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </LinearGradient>

      {/* List */}
      <FlatList
        data={results}
        keyExtractor={(h) => h.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => navigation.navigate("HymnDetail", { hymnId: item.id })}
          >
            <View style={styles.rowLeft}>
              <View style={styles.noteTag}>
                <Text style={styles.noteTagText}>♩</Text>
              </View>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.rowMeta}>
                {item.author} · {item.year}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptySymbol}>♪</Text>
            <Text style={styles.emptyText}>No hymns match "{query}"</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
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
    marginBottom: 2,
  },
  headerSub: {
    ...typography.caption,
    color: "rgba(255,255,255,0.5)",
    marginBottom: spacing.md,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  searchIcon: { color: "rgba(255,255,255,0.5)", fontSize: 18, marginRight: spacing.sm },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    color: colors.white,
    fontSize: 15,
  },
  listContent: { paddingBottom: spacing.xxl },
  separator: { height: 1, backgroundColor: colors.parchmentMid, marginLeft: 68 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowPressed: { backgroundColor: colors.parchment },
  rowLeft: { marginRight: spacing.md },
  noteTag: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.parchmentMid,
    alignItems: "center",
    justifyContent: "center",
  },
  noteTagText: { color: colors.olive, fontSize: 18, fontWeight: "700" },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 2 },
  rowMeta: { ...typography.caption, color: colors.inkFaint },
  chevron: { fontSize: 24, color: colors.oliveFaint, fontWeight: "300" },
  empty: { alignItems: "center", paddingTop: spacing.xxl },
  emptySymbol: { fontSize: 40, color: colors.oliveFaint, marginBottom: spacing.md },
  emptyText: { ...typography.body, color: colors.inkSoft, textAlign: "center" },
});
