import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { colors, radii, spacing, typography } from "../../theme/theme";

type NoteRow = {
  id: string;
  book_name: string;
  chapter: number;
  verse: number | null;
  content: string;
  created_at: string;
};

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
      return () => {
        active = false;
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.olive} />
      </View>
    );
  }

  if (notes.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No notes yet. Tap a verse while reading to add one.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: spacing.lg }}
      data={notes}
      keyExtractor={(n) => n.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.reference}>
            {item.book_name} {item.chapter}
            {item.verse ? `:${item.verse}` : ""}
          </Text>
          <Text style={styles.content}>{item.content}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  emptyText: { ...typography.body, color: colors.inkSoft, textAlign: "center" },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  reference: { ...typography.subtitle, color: colors.oliveDark, marginBottom: spacing.xs },
  content: { ...typography.body, color: colors.ink },
});
