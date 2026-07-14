import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors, radii, spacing } from "../theme/theme";

// Shown for the brief window between the splash animation finishing and the
// session/auth check resolving. Mirrors the Home screen's actual layout
// (header block + card rows) so the transition into the real content feels
// continuous rather than a jarring blank-to-full-UI pop — this is the "alive"
// loading state instead of a dead flash of nothing.
function Shimmer({ style }: { style: any }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[style, { opacity: pulse }]} />;
}

export default function SkeletonHomeLoader() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Shimmer style={styles.eyebrow} />
        <Shimmer style={styles.title} />
      </View>
      <View style={styles.cards}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.card}>
            <Shimmer style={styles.cardIcon} />
            <View style={styles.cardBody}>
              <Shimmer style={styles.cardTitle} />
              <Shimmer style={styles.cardDesc} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  header: {
    backgroundColor: colors.oliveDark,
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: spacing.lg,
  },
  eyebrow: {
    width: 90,
    height: 10,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginBottom: 10,
  },
  title: {
    width: 200,
    height: 24,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  cards: { padding: spacing.lg, gap: spacing.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.parchmentDark,
  },
  cardBody: { flex: 1, gap: 8 },
  cardTitle: { width: "50%", height: 14, borderRadius: 4, backgroundColor: colors.parchmentDark },
  cardDesc: { width: "80%", height: 11, borderRadius: 4, backgroundColor: colors.parchmentDark },
});
