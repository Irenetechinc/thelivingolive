import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";
import { randomQuoteIndex, quoteAtIndex, type Quote } from "../../data/bibleQuotes";

type Props = NativeStackScreenProps<RootStackParamList, "BibleHome">;

export type BibleVersion = "KJV" | "WEB" | "ASV";

const VERSIONS: { id: BibleVersion; label: string; full: string; year: string; description: string }[] = [
  {
    id: "KJV",
    label: "KJV",
    full: "King James Version",
    year: "1611",
    description: "Majestic Elizabethan prose — the most quoted English translation.",
  },
  {
    id: "WEB",
    label: "WEB",
    full: "World English Bible",
    year: "Modern",
    description: "A flowing modern update in everyday English. Public domain.",
  },
  {
    id: "ASV",
    label: "ASV",
    full: "American Standard Version",
    year: "1901",
    description: "Precise and literal — widely used for serious study.",
  },
];

const VERSION_PREF_KEY = "bible:preferred_version";

export default function BibleHomeScreen({ navigation }: Props) {
  const [version, setVersion] = useState<BibleVersion>("KJV");
  const [quotes, setQuotes] = useState<Record<BibleVersion, Quote>>(() => {
    const idx = randomQuoteIndex();
    return { KJV: quoteAtIndex("KJV", idx), WEB: quoteAtIndex("WEB", idx), ASV: quoteAtIndex("ASV", idx) };
  });

  useEffect(() => {
    AsyncStorage.getItem(VERSION_PREF_KEY).then((v) => {
      if (v && VERSIONS.find((x) => x.id === v)) setVersion(v as BibleVersion);
    });
  }, []);

  // A fresh quote — same verse, all three translations — every time this
  // screen is revisited, so each card feels alive and they clearly show
  // how the same passage reads differently across translations.
  useFocusEffect(
    React.useCallback(() => {
      const idx = randomQuoteIndex();
      setQuotes({ KJV: quoteAtIndex("KJV", idx), WEB: quoteAtIndex("WEB", idx), ASV: quoteAtIndex("ASV", idx) });
    }, [])
  );

  function selectVersion(v: BibleVersion) {
    setVersion(v);
    AsyncStorage.setItem(VERSION_PREF_KEY, v);
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header strip */}
      <LinearGradient
        colors={["#2E3A1F", "#3E4A2F", "#4A5A36"]}
        style={styles.headerStrip}
      >
        <Text style={styles.headerEyebrow}>CHOOSE YOUR TRANSLATION</Text>
        <Text style={styles.headerTitle}>66 Books. One Story.</Text>
      </LinearGradient>

      <View style={styles.body}>
        {/* Version selector */}
        <View style={styles.section}>
          {VERSIONS.map((v) => {
            const active = version === v.id;
            return (
              <Pressable
                key={v.id}
                style={({ pressed }) => [
                  styles.versionCard,
                  active && styles.versionCardActive,
                  pressed && styles.versionCardPressed,
                ]}
                onPress={() => selectVersion(v.id)}
              >
                {active && (
                  <LinearGradient
                    colors={["#3E4A2F", "#5B6B45"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.activeGradient}
                  />
                )}
                <View style={styles.versionCardInner}>
                  <View style={styles.versionTop}>
                    <View>
                      <Text style={[styles.versionLabel, active && styles.versionLabelActive]}>
                        {v.label}
                      </Text>
                      <Text style={[styles.versionFull, active && styles.versionFullActive]}>
                        {v.full} · {v.year}
                      </Text>
                    </View>
                    {active && (
                      <View style={styles.checkBadge}>
                        <Text style={styles.checkText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.quoteRow}>
                    <View style={[styles.quoteBar, active && styles.quoteBarActive]} />
                    <Text
                      style={[styles.quoteText, active && styles.quoteTextActive]}
                      numberOfLines={3}
                    >
                      "{quotes[v.id].text}"{"  "}
                      <Text style={[styles.quoteRef, active && styles.quoteRefActive]}>
                        — {quotes[v.id].reference}
                      </Text>
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Primary CTA */}
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={() => navigation.navigate("BookPicker", { version })}
        >
          <LinearGradient
            colors={["#3E4A2F", "#5B6B45"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryBtnGrad}
          >
            <Text style={styles.primaryBtnText}>Open {version} Bible</Text>
            <Text style={styles.primaryBtnArrow}>→</Text>
          </LinearGradient>
        </Pressable>

        {/* Notes link */}
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate("Notes")}
        >
          <Text style={styles.secondaryBtnText}>My highlights & notes</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  headerStrip: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerEyebrow: {
    ...typography.micro,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.4,
  },
  body: { padding: spacing.lg },
  section: { marginBottom: spacing.lg, gap: spacing.sm },
  versionCard: {
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: "transparent",
    ...shadows.subtle,
  },
  versionCardActive: {
    borderColor: colors.olive,
  },
  versionCardPressed: { opacity: 0.88 },
  activeGradient: { ...StyleSheet.absoluteFill },
  versionCardInner: { padding: spacing.md },
  versionTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  versionLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 2,
  },
  versionLabelActive: { color: colors.white },
  versionFull: { ...typography.caption, color: colors.inkSoft },
  versionFullActive: { color: "rgba(255,255,255,0.7)" },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  versionDesc: { ...typography.bodySmall, color: colors.inkSoft, lineHeight: 20 },
  versionDescActive: { color: "rgba(255,255,255,0.75)" },
  quoteRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quoteBar: { width: 2, borderRadius: 2, backgroundColor: colors.parchmentDark },
  quoteBarActive: { backgroundColor: "rgba(255,255,255,0.4)" },
  quoteText: {
    ...typography.bodySmall,
    fontSize: 13,
    fontStyle: "italic",
    color: colors.inkFaint,
    flex: 1,
    lineHeight: 19,
  },
  quoteTextActive: { color: "rgba(255,255,255,0.6)" },
  quoteRef: { fontStyle: "normal", fontWeight: "700", color: colors.inkSoft },
  quoteRefActive: { color: "rgba(255,255,255,0.85)" },
  primaryBtn: {
    borderRadius: radii.lg,
    overflow: "hidden",
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  primaryBtnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  primaryBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  primaryBtnText: {
    color: colors.parchment,
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  primaryBtnArrow: { color: colors.oliveFaint, fontSize: 18, fontWeight: "300" },
  secondaryBtn: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
  },
  secondaryBtnText: { color: colors.olive, fontWeight: "600", fontSize: 15 },
});
