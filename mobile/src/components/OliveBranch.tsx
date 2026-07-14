import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Path, Ellipse } from "react-native-svg";
import { colors } from "../theme/theme";

// A small always-present decorative olive branch that gently sways in the
// bottom-left corner, on every screen. It's the app's living signature —
// "The Living Olive" made literal.
//
// Perf notes (matters on low-memory/low-end devices):
// - Pure vector (react-native-svg), so it's a handful of KB, not an image
//   asset — no decode cost, crisp at any density.
// - A single native-driven rotation loop (Animated + useNativeDriver) runs
//   on the UI thread, not JS, so it costs ~nothing even on weak CPUs and
//   never blocks scrolling/interaction.
// - pointerEvents="none" so it never intercepts touches.
// - Rendered once, absolutely positioned, memoized — re-renders of the
//   screen behind it never re-render or re-measure this component.

function OliveBranchSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 100 115">
      {/* Branch stem */}
      <Path
        d="M85 110 C 60 90, 45 70, 40 45 C 36 25, 42 8, 55 2"
        stroke={colors.oliveDark}
        strokeWidth={3.2}
        fill="none"
        strokeLinecap="round"
      />
      {/* Leaves — alternating along the stem */}
      {[
        { x: 62, y: 14, r: -35, s: 1 },
        { x: 50, y: 24, r: 30, s: 0.95 },
        { x: 58, y: 34, r: -30, s: 1.05 },
        { x: 45, y: 44, r: 28, s: 0.9 },
        { x: 52, y: 56, r: -25, s: 1 },
        { x: 42, y: 68, r: 25, s: 0.95 },
        { x: 50, y: 80, r: -20, s: 1.05 },
        { x: 44, y: 94, r: 18, s: 0.9 },
      ].map((leaf, i) => (
        <Ellipse
          key={i}
          cx={leaf.x}
          cy={leaf.y}
          rx={9 * leaf.s}
          ry={4 * leaf.s}
          fill={colors.oliveLight}
          opacity={0.85}
          transform={`rotate(${leaf.r} ${leaf.x} ${leaf.y})`}
        />
      ))}
      {/* A couple of olives */}
      <Ellipse cx={38} cy={52} rx={4} ry={5.2} fill={colors.oliveDark} opacity={0.9} />
      <Ellipse cx={56} cy={70} rx={4} ry={5.2} fill="#4A5A20" opacity={0.85} />
    </Svg>
  );
}

export default function OliveBranch({ size = 96 }: { size?: number }) {
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 2600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sway]);

  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ["-4deg", "5deg"] });
  const translateY = sway.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View
        style={{
          transform: [{ translateY }, { rotate }],
          transformOrigin: "bottom left" as any,
        }}
      >
        <OliveBranchSvg size={size} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: -6,
    left: -8,
    zIndex: 50,
    opacity: 0.92,
  },
});
