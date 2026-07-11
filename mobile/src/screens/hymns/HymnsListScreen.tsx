import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { searchHymns } from "../../data/hymns";
import { colors, radii, spacing, typography } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "HymnsList">;

export default function HymnsListScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHymns(query), [query]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search hymns by title, author, or lyric..."
        placeholderTextColor={colors.inkSoft}
        value={query}
        onChangeText={setQuery}
      />
      <FlatList
        data={results}
        keyExtractor={(h) => h.id}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate("HymnDetail", { hymnId: item.id })}>
            <View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.author} · {item.year}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No hymns match "{query}".</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment, padding: spacing.lg },
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
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { ...typography.subtitle, color: colors.ink },
  meta: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.oliveLight },
  empty: { ...typography.body, color: colors.inkSoft, textAlign: "center", marginTop: spacing.xl },
});
