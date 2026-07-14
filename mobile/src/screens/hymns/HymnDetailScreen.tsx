import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { hymns } from "../../data/hymns";
import { getHymnAutoHighlightPref, setHymnAutoHighlightPref } from "../../lib/settings";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "HymnDetail">;

type Line = {
  key: string;
  text: string;
  section: "verse" | "chorus";
  sectionIndex: number;
  isFirstOfSection: boolean;
};

// Roughly how long a sung line takes, scaled by word count so short lines
// ("Amen.") don't linger and long lines get enough time — there's no audio
// track to sync to, so this simulates a natural singing pace.
const MS_PER_WORD = 420;
const MIN_LINE_MS = 1600;
const MAX_LINE_MS = 6000;

function lineDurationMs(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1;
  return Math.min(MAX_LINE_MS, Math.max(MIN_LINE_MS, words * MS_PER_WORD));
}

export default function HymnDetailScreen({ route }: Props) {
  const hymn = hymns.find((h) => h.id === route.params.hymnId);

  const lines = useMemo<Line[]>(() => {
    if (!hymn) return [];
    const out: Line[] = [];
    hymn.verses.forEach((verse, vi) => {
      verse
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .forEach((text, li) => {
          out.push({ key: `v${vi}-${li}`, text, section: "verse", sectionIndex: vi, isFirstOfSection: li === 0 });
        });
    });
    if (hymn.chorus) {
      hymn.chorus
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .forEach((text, li) => {
          out.push({ key: `c-${li}`, text, section: "chorus", sectionIndex: 0, isFirstOfSection: li === 0 });
        });
    }
    return out;
  }, [hymn]);

  const [autoHighlight, setAutoHighlight] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const [prefLoaded, setPrefLoaded] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const lineOffsets = useRef<Record<number, number>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the persisted preference once, then auto-start if it's enabled —
  // the feature must work "out of the box" without the user touching a
  // toggle first.
  useEffect(() => {
    getHymnAutoHighlightPref().then((enabled) => {
      setAutoHighlight(enabled);
      setPrefLoaded(true);
      if (enabled) {
        setActiveLine(0);
        setPlaying(true);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!playing || !autoHighlight) return;
    if (activeLine < 0 || activeLine >= lines.length - 1) {
      if (activeLine >= lines.length - 1) setPlaying(false);
      return;
    }
    const duration = lineDurationMs(lines[activeLine]?.text ?? "");
    timerRef.current = setTimeout(() => {
      setActiveLine((i) => Math.min(i + 1, lines.length - 1));
    }, duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, autoHighlight, activeLine, lines]);

  useEffect(() => {
    if (!autoHighlight || activeLine < 0) return;
    const y = lineOffsets.current[activeLine];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 140), animated: true });
    }
  }, [activeLine, autoHighlight]);

  async function handleToggleAutoHighlight(value: boolean) {
    setAutoHighlight(value);
    await setHymnAutoHighlightPref(value);
    if (value) {
      setActiveLine(0);
      setPlaying(true);
    } else {
      setPlaying(false);
      setActiveLine(-1);
    }
  }

  function handlePlayPause() {
    if (activeLine < 0) setActiveLine(0);
    setPlaying((p) => !p);
  }

  function handleRestart() {
    setActiveLine(0);
    setPlaying(true);
  }

  if (!hymn) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Hymn not found.</Text>
      </View>
    );
  }

  let runningLineIndex = -1;

  return (
    <ScrollView ref={scrollRef} style={styles.container} showsVerticalScrollIndicator={false}>
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

      {/* Sing-along controls */}
      <View style={styles.controlBar}>
        <View style={styles.controlRow}>
          <Text style={styles.controlLabel}>Sing-along highlight</Text>
          <Switch
            value={autoHighlight}
            onValueChange={handleToggleAutoHighlight}
            trackColor={{ false: colors.parchmentDark, true: colors.oliveLight }}
            thumbColor={colors.white}
          />
        </View>
        {autoHighlight && prefLoaded && (
          <View style={styles.controlRow}>
            <Pressable
              style={({ pressed }) => [styles.controlBtn, pressed && { opacity: 0.8 }]}
              onPress={handlePlayPause}
            >
              <Text style={styles.controlBtnText}>{playing ? "⏸ Pause" : "▶ Play"}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.controlBtn, styles.controlBtnGhost, pressed && { opacity: 0.8 }]}
              onPress={handleRestart}
            >
              <Text style={[styles.controlBtnText, styles.controlBtnGhostText]}>↺ Restart</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {/* Verses */}
        {hymn.verses.map((verse, idx) => {
          const verseLines = verse.split("\n").filter((l) => l.trim().length > 0);
          return (
            <View key={idx} style={styles.verseBlock}>
              <View style={styles.verseHeader}>
                <View style={styles.verseLine} />
                <Text style={styles.verseLabel}>VERSE {idx + 1}</Text>
                <View style={styles.verseLine} />
              </View>
              <Text style={styles.verseText}>
                {verseLines.map((lineText, li) => {
                  runningLineIndex += 1;
                  const globalIndex = runningLineIndex;
                  const isActive = autoHighlight && globalIndex === activeLine;
                  return (
                    <Text
                      key={li}
                      onLayout={(e: LayoutChangeEvent) => {
                        lineOffsets.current[globalIndex] = e.nativeEvent.layout.y;
                      }}
                      style={isActive ? styles.activeLine : undefined}
                    >
                      {lineText}
                      {li < verseLines.length - 1 ? "\n" : ""}
                    </Text>
                  );
                })}
              </Text>
            </View>
          );
        })}

        {/* Chorus */}
        {hymn.chorus &&
          (() => {
            const chorusLines = hymn.chorus!.split("\n").filter((l) => l.trim().length > 0);
            return (
              <View style={[styles.verseBlock, styles.chorusBlock]}>
                <View style={styles.verseHeader}>
                  <View style={[styles.verseLine, styles.chorusLine]} />
                  <Text style={[styles.verseLabel, styles.chorusLabel]}>CHORUS</Text>
                  <View style={[styles.verseLine, styles.chorusLine]} />
                </View>
                <Text style={[styles.verseText, styles.chorusText]}>
                  {chorusLines.map((lineText, li) => {
                    runningLineIndex += 1;
                    const globalIndex = runningLineIndex;
                    const isActive = autoHighlight && globalIndex === activeLine;
                    return (
                      <Text
                        key={li}
                        onLayout={(e: LayoutChangeEvent) => {
                          lineOffsets.current[globalIndex] = e.nativeEvent.layout.y;
                        }}
                        style={isActive ? styles.activeChorusLine : undefined}
                      >
                        {lineText}
                        {li < chorusLines.length - 1 ? "\n" : ""}
                      </Text>
                    );
                  })}
                </Text>
              </View>
            );
          })()}

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
  controlBar: {
    marginTop: -spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.subtle,
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  controlLabel: { ...typography.body, color: colors.oliveDark, fontWeight: "600" },
  controlBtn: {
    flex: 1,
    backgroundColor: colors.olive,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  controlBtnGhost: {
    backgroundColor: colors.parchment,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
  },
  controlBtnText: { color: colors.white, fontWeight: "700" },
  controlBtnGhostText: { color: colors.oliveDark },
  body: {
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
  activeLine: {
    backgroundColor: "#F6E3A1",
    color: colors.oliveDark,
    fontWeight: "700",
  },
  activeChorusLine: {
    backgroundColor: colors.white,
    color: colors.terracotta,
    fontWeight: "700",
    textDecorationLine: "underline",
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
