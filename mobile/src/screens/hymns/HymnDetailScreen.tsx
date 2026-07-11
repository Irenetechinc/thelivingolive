import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { hymns } from "../../data/hymns";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "HymnDetail">;

export default function HymnDetailScreen({ route }: Props) {
  const hymn = hymns.find((h) => h.id === route.params.hymnId);

  if (!hymn) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Hymn not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={["#9A3F1F", "#C1693A", "#D4845A"]}
        locations={[0, 0.6, 1]}
        style={styles.header}
      >
        <View style={styles.noteBadge}>
          <Text style={styles.noteBadgeText}>♩</Text>
        </View>
        <Text style={styles.hymnTitle}>{hymn.title}</Text>
        <Text style={styles.hymnMeta}>
          {hymn.author} · {hymn.year}
        </Text>
      </LinearGradient>

      <View style={styles.body}>
        {/* Verses */}
        {hymn.verses.map((verse, idx) => (
          <View key={idx} style={styles.verseBlock}>
            <View style={styles.verseHeader}>
              <View style={styles.verseLine} />
              <Text style={styles.verseLabel}>VERSE {idx + 1}</Text>
              <View style={styles.verseLine} />
            </View>
            <Text style={styles.verseText}>{verse}</Text>
          </View>
        ))}

        {/* Chorus */}
        {hymn.chorus && (
          <View style={[styles.verseBlock, styles.chorusBlock]}>
            <View style={styles.verseHeader}>
              <View style={[styles.verseLine, styles.chorusLine]} />
              <Text style={[styles.verseLabel, styles.chorusLabel]}>CHORUS</Text>
              <View style={[styles.verseLine, styles.chorusLine]} />
            </View>
            <Text style={[styles.verseText, styles.chorusText]}>{hymn.chorus}</Text>
          </View>
        )}

        {/* Footer attribution */}
        <View style={styles.attribution}>
          <View style={styles.attrDivider} />
          <Text style={styles.attrText}>{hymn.title}</Text>
          <Text style={styles.attrSub}>
            {hymn.author} · {hymn.year} · Public Domain
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { ...typography.body, color: colors.inkSoft },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    alignItems: "center",
  },
  noteBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  noteBadgeText: { color: colors.white, fontSize: 26, fontWeight: "700" },
  hymnTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.white,
    textAlign: "center",
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
  },
  hymnMeta: {
    ...typography.caption,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
  },
  body: {
    marginTop: -spacing.xl,
    backgroundColor: colors.parchment,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingTop: spacing.xl,
    minHeight: 400,
  },
  verseBlock: {
    marginBottom: spacing.xl,
  },
  verseHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  verseLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.parchmentDark,
  },
  verseLabel: {
    ...typography.micro,
    color: colors.inkFaint,
    letterSpacing: 2,
  },
  verseText: {
    ...typography.body,
    color: colors.ink,
    lineHeight: 30,
  },
  chorusBlock: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadows.subtle,
  },
  chorusLine: { backgroundColor: colors.terracotta, opacity: 0.3 },
  chorusLabel: { color: colors.terracotta },
  chorusText: { fontStyle: "italic", color: colors.oliveDark },
  attribution: { alignItems: "center", paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  attrDivider: { width: 40, height: 1, backgroundColor: colors.parchmentDark, marginBottom: spacing.md },
  attrText: { ...typography.caption, color: colors.inkFaint, marginBottom: 2, fontStyle: "italic" },
  attrSub: { ...typography.micro, color: colors.inkFaint, letterSpacing: 0.5, textAlign: "center" },
});
