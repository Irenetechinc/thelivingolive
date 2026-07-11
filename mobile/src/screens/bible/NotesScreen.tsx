import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";

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
      return () => { active = false; };
    }, [])
  );

  return (
    <View style={styles.container}>
      {/* Header strip */}
      <LinearGradient
        colors={["#2E3A1F", "#3E4A2F", "#4A5A36"]}
        style={styles.header}
      >
        <Text style={styles.headerEyebrow}>YOUR STUDY NOTES</Text>
        <Text style={styles.headerTitle}>Highlights & Notes</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.olive} size="large" />
        </View>
      ) : notes.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptySymbol}>✦</Text>
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptyText}>
            Tap any verse while reading to highlight it or add a note.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.refBadge}>
                  <Text style={styles.refText}>
                    {item.book_name} {item.chapter}
                    {item.verse ? `:${item.verse}` : ""}
                  </Text>
                </View>
                <Text style={styles.dateText}>
                  {new Date(item.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </View>
              <Text style={styles.content}>{item.content}</Text>
            </View>
          )}
        />
      )}
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
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptySymbol: { fontSize: 36, color: colors.oliveFaint, marginBottom: spacing.md },
  emptyTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: spacing.sm },
  emptyText: {
    ...typography.bodySmall,
    color: colors.inkSoft,
    textAlign: "center",
    lineHeight: 22,
  },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadows.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  refBadge: {
    backgroundColor: colors.parchment,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
  },
  refText: { ...typography.caption, color: colors.oliveDark, fontWeight: "600" },
  dateText: { ...typography.micro, color: colors.inkFaint },
  content: { ...typography.bodySmall, color: colors.ink, lineHeight: 22 },
});
