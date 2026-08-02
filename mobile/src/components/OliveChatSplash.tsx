/**
 * OliveChatSplash — beautifully animated splash screen shown once per session
 * when the user enters Olive Chat.  Fades out after ~2 s automatically.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography } from '../theme/theme';

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  onFinish: () => void;
}

export default function OliveChatSplash({ onFinish }: Props) {
  const logoScale  = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const tagOpacity  = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  // Pulse ring animations
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(tagOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Pulse rings
    const pulseLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ring1, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(ring1, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(600),
          Animated.timing(ring2, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(ring2, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    pulseLoop.start();

    // Auto-dismiss after 2.2s
    const timer = setTimeout(() => {
      pulseLoop.stop();
      Animated.timing(screenOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(onFinish);
    }, 2200);

    return () => {
      clearTimeout(timer);
      pulseLoop.stop();
    };
  }, []);

  const ring1Style = {
    opacity: ring1.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 0.3, 0] }),
    transform: [{ scale: ring1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
  };
  const ring2Style = {
    opacity: ring2.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.35, 0.2, 0] }),
    transform: [{ scale: ring2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
  };

  return (
    // pointerEvents="none" is critical: an opacity-0 Animated.View with absoluteFill still
    // intercepts all touches in React Native (opacity does NOT disable hit-testing the way
    // CSS does). Since this splash is purely decorative, we never need to receive touches.
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: screenOpacity, zIndex: 999 }]}>
      <LinearGradient colors={['#1A2410', '#2E3A1F', '#3E4A2F', '#5B6B45']} style={styles.bg}>
        {/* Background decorative circles */}
        <View style={styles.bgDecor1} />
        <View style={styles.bgDecor2} />
        <View style={styles.bgDecor3} />

        {/* Pulse rings */}
        <View style={styles.ringContainer} pointerEvents="none">
          <Animated.View style={[styles.ring, ring1Style]} />
          <Animated.View style={[styles.ring, ring2Style]} />
        </View>

        {/* Logo */}
        <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <LinearGradient colors={['#8A6A10', '#C9A227', '#E2C060']} style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🫒</Text>
          </LinearGradient>
        </Animated.View>

        {/* Title */}
        <Animated.View style={{ opacity: textOpacity, alignItems: 'center', marginTop: spacing.lg }}>
          <Text style={styles.title}>Olive Chat</Text>
          <View style={styles.titleUnderline} />
        </Animated.View>

        {/* Tagline */}
        <Animated.View style={{ opacity: tagOpacity, alignItems: 'center', marginTop: spacing.sm }}>
          <Text style={styles.tagline}>Connecting the body of Christ worldwide</Text>
          <View style={styles.dotsRow}>
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.dot} />
            ))}
          </View>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const LOGO_SIZE = 96;
const RING_SIZE = LOGO_SIZE;

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bgDecor1: {
    position: 'absolute', top: -80, right: -80,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bgDecor2: {
    position: 'absolute', bottom: -60, left: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bgDecor3: {
    position: 'absolute', top: H * 0.3, left: -40,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(201,162,39,0.06)',
  },
  ringContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: RING_SIZE,
    height: RING_SIZE,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: 'rgba(201,162,39,0.25)',
  },
  logoWrap: {
    ...StyleSheet.absoluteFill as any,
    position: 'relative',
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  logoCircle: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C9A227',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
  },
  logoEmoji: {
    fontSize: 44,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  titleUnderline: {
    marginTop: 6,
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#C9A227',
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(201,162,39,0.5)',
  },
});
