import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { height } = Dimensions.get("window");

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const ringAnim = useRef(new Animated.Value(0)).current;
  const brandAnim = useRef(new Animated.Value(0)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;
  const poweredAnim = useRef(new Animated.Value(0)).current;
  const exitAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Ring fades/scales in
      Animated.spring(ringAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      // 2. Brand name slides up
      Animated.timing(brandAnim, {
        toValue: 1,
        duration: 480,
        useNativeDriver: true,
      }),
      // 3. Tagline fades in
      Animated.timing(taglineAnim, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
      // 4. Powered by fades in
      Animated.timing(poweredAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      // 5. Hold
      Animated.delay(1000),
      // 6. Fade out entire screen
      Animated.timing(exitAnim, {
        toValue: 0,
        duration: 340,
        useNativeDriver: true,
      }),
    ]).start(onFinish);
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: exitAnim, zIndex: 999 }]}>
      <LinearGradient
        colors={["#1C2712", "#2E3A1F", "#3E4A2F", "#5B6B45", "#8A9A6B"]}
        locations={[0, 0.2, 0.45, 0.72, 1]}
        style={styles.container}
      >
        {/* Decorative arc lines */}
        <View style={styles.arcWrap} pointerEvents="none">
          <View style={[styles.arc, styles.arc1]} />
          <View style={[styles.arc, styles.arc2]} />
          <View style={[styles.arc, styles.arc3]} />
        </View>

        {/* Logo ring */}
        <Animated.View
          style={[
            styles.logoWrap,
            {
              opacity: ringAnim,
              transform: [
                {
                  scale: ringAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.outerRing}>
            <View style={styles.innerRing}>
              {/* Olive leaf cross */}
              <Text style={styles.logoMark}>✦</Text>
            </View>
          </View>
          {/* Ring orbiting dots */}
          <View style={[styles.orbitDot, { top: -4, left: "50%", marginLeft: -4 }]} />
          <View style={[styles.orbitDot, { bottom: -4, left: "50%", marginLeft: -4 }]} />
          <View style={[styles.orbitDot, { left: -4, top: "50%", marginTop: -4 }]} />
          <View style={[styles.orbitDot, { right: -4, top: "50%", marginTop: -4 }]} />
        </Animated.View>

        {/* Brand name */}
        <Animated.View
          style={{
            opacity: brandAnim,
            transform: [
              {
                translateY: brandAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          }}
        >
          <Text style={styles.brand}>The Living Olive</Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View style={{ opacity: taglineAnim }}>
          <View style={styles.taglineRow}>
            <View style={styles.taglineDash} />
            <Text style={styles.tagline}>Scripture · Hymns · Devotion · Prayer</Text>
            <View style={styles.taglineDash} />
          </View>
        </Animated.View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: poweredAnim }]}>
          <View style={styles.footerDivider} />
          <Text style={styles.poweredLabel}>POWERED BY</Text>
          <Text style={styles.poweredBrand}>SYNTAX</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  arcWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  arc: {
    position: "absolute",
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  arc1: { width: 240, height: 240 },
  arc2: { width: 360, height: 360 },
  arc3: { width: 500, height: 500 },
  logoWrap: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  outerRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  innerRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoMark: {
    fontSize: 28,
    color: "#E2C060",
  },
  orbitDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C9A227",
  },
  brand: {
    fontSize: 36,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.8,
    textAlign: "center",
    marginBottom: 12,
  },
  taglineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 0,
  },
  taglineDash: {
    height: 1,
    width: 24,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  tagline: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 48,
    alignItems: "center",
  },
  footerDivider: {
    width: 40,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 12,
  },
  poweredLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 2,
  },
  poweredBrand: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 4,
    marginTop: 2,
  },
});
