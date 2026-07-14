import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing, typography, shadows } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const cards: {
  key: keyof RootStackParamList;
  title: string;
  description: string;
  symbol: string;
  gradient: [string, string];
  accent: string;
}[] = [
  {
    key: "BibleHome",
    title: "Bible",
    description: "Read, highlight & study scripture",
    symbol: "✦",
    gradient: ["#3E4A2F", "#5B6B45"],
    accent: "#8A9A6B",
  },
  {
    key: "HymnsList",
    title: "Hymns",
    description: "55 public-domain hymns with full lyrics",
    symbol: "♩",
    gradient: ["#9A3F1F", "#C1693A"],
    accent: "#D4845A",
  },
  {
    key: "Devotions",
    title: "Daily Devotions",
    description: "Spirit-guided devotionals rooted in scripture",
    symbol: "◎",
    gradient: ["#8A6A10", "#C9A227"],
    accent: "#E2C060",
  },
  {
    key: "Prayer",
    title: "Prayer Points",
    description: "Bible-rooted prayers for your heart's desires",
    symbol: "✿",
    gradient: ["#2A3820", "#3E4A2F"],
    accent: "#6B8055",
  },
];

function useStaggeredAnim(count: number, delay = 80) {
  const anims = useRef(cards.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      delay,
      anims.map((a) =>
        Animated.spring(a, { toValue: 1, tension: 60, friction: 9, useNativeDriver: true })
      )
    ).start();
  }, []);
  return anims;
}

export default function HomeScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardAnims = useStaggeredAnim(cards.length, 70);

  useEffect(() => {
    Animated.spring(headerAnim, {
      toValue: 1,
      tension: 55,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 5 ? "Still night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Gradient Header */}
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [
            {
              translateY: headerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-16, 0],
              }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={["#1C2712", "#2E3A1F", "#3E4A2F", "#4A5A36"]}
          locations={[0, 0.3, 0.65, 1]}
          style={styles.header}
        >
          {/* Decorative arcs */}
          <View style={styles.arcWrap} pointerEvents="none">
            <View style={[styles.arc, { width: 260, height: 260, borderRadius: 130 }]} />
            <View style={[styles.arc, { width: 380, height: 380, borderRadius: 190 }]} />
          </View>

          <View style={styles.headerTop}>
            <View>
              <Text style={styles.eyebrow}>{greeting}</Text>
              <Text style={styles.headerTitle}>The Living Olive</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.6 }]}
              onPress={signOut}
              hitSlop={12}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>

          <View style={styles.headerDivider} />

          <View style={styles.mottoRow}>
            <View style={styles.mottoDot} />
            <Text style={styles.motto}>Rooted in the Word, growing every day</Text>
            <View style={styles.mottoDot} />
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Cards */}
      <View style={styles.cardsSection}>
        {cards.map((card, i) => (
          <Animated.View
            key={card.key}
            style={{
              opacity: cardAnims[i],
              transform: [
                {
                  translateY: cardAnims[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            }}
          >
            <Pressable
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={() => navigation.navigate(card.key as any)}
            >
              <LinearGradient
                colors={card.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardIconWrap}
              >
                <Text style={[styles.cardSymbol, { color: card.accent }]}>
                  {card.symbol}
                </Text>
              </LinearGradient>

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardDesc}>{card.description}</Text>
              </View>

              <View style={styles.cardArrow}>
                <Text style={styles.cardArrowText}>›</Text>
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLine} />
        <Text style={styles.footerText}>POWERED BY SYNTAX</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  content: { paddingBottom: spacing.xxl },
  header: {
    paddingTop: 60,
    paddingBottom: 28,
    paddingHorizontal: spacing.lg,
    overflow: "hidden",
  },
  arcWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  arc: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  eyebrow: {
    ...typography.caption,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.6,
  },
  signOutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    marginTop: 4,
  },
  signOutText: { color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: "500" },
  headerDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginBottom: 14,
  },
  mottoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mottoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gold,
  },
  motto: {
    ...typography.caption,
    color: "rgba(255,255,255,0.5)",
    fontStyle: "italic",
    flex: 1,
  },
  cardsSection: {
    padding: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    overflow: "hidden",
    ...shadows.card,
  },
  cardPressed: { transform: [{ scale: 0.975 }], opacity: 0.92 },
  cardIconWrap: {
    width: 72,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardSymbol: { fontSize: 26, fontWeight: "700" },
  cardBody: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  cardTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 3 },
  cardDesc: { ...typography.bodySmall, color: colors.inkSoft, lineHeight: 20 },
  cardArrow: {
    paddingRight: spacing.md,
    paddingLeft: spacing.xs,
  },
  cardArrowText: { fontSize: 26, color: colors.oliveFaint, fontWeight: "300" },
  footer: {
    alignItems: "center",
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  footerLine: {
    width: 32,
    height: 1,
    backgroundColor: colors.parchmentDark,
    marginBottom: spacing.sm,
  },
  footerText: {
    ...typography.micro,
    color: colors.inkFaint,
    letterSpacing: 2,
  },
});
