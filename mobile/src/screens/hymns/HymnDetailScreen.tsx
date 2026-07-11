import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { hymns } from "../../data/hymns";
import { colors, spacing, typography } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "HymnDetail">;

export default function HymnDetailScreen({ route }: Props) {
  const hymn = hymns.find((h) => h.id === route.params.hymnId);

  if (!hymn) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Hymn not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.title}>{hymn.title}</Text>
      <Text style={styles.meta}>
        {hymn.author} · {hymn.year}
      </Text>

      {hymn.verses.map((verse, idx) => (
        <View key={idx} style={styles.verseBlock}>
          <Text style={styles.verseLabel}>Verse {idx + 1}</Text>
          <Text style={styles.verseText}>{verse}</Text>
        </View>
      ))}

      {hymn.chorus && (
        <View style={styles.verseBlock}>
          <Text style={styles.verseLabel}>Chorus</Text>
          <Text style={[styles.verseText, styles.chorusText]}>{hymn.chorus}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { ...typography.display, color: colors.oliveDark },
  meta: { ...typography.caption, color: colors.inkSoft, marginBottom: spacing.lg },
  verseBlock: { marginBottom: spacing.lg },
  verseLabel: { ...typography.caption, color: colors.terracotta, textTransform: "uppercase", marginBottom: spacing.xs },
  verseText: { ...typography.body, color: colors.ink },
  chorusText: { fontStyle: "italic" },
  body: { ...typography.body, color: colors.inkSoft },
});
