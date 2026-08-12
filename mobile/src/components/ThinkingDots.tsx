import React, { useEffect, useState } from "react";
import { View, Animated, StyleSheet } from "react-native";

/**
 * Three pulsing dots shown during generation (prayer / devotion).
 * Replaces the plain ActivityIndicator so users understand the app is
 * "thinking" rather than just loading data.
 */
export function ThinkingDots({ color = "#FDF6E3" }: { color?: string }) {
  const [anims] = useState(() => [
    new Animated.Value(0.25),
    new Animated.Value(0.25),
    new Animated.Value(0.25),
  ]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        210,
        anims.map((a) =>
          Animated.sequence([
            Animated.timing(a, { toValue: 1, duration: 320, useNativeDriver: true }),
            Animated.timing(a, { toValue: 0.25, duration: 320, useNativeDriver: true }),
          ])
        )
      )
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={styles.row}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { backgroundColor: color, opacity: anim }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 5, marginRight: 8 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
});
