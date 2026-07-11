import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing, typography, shadows } from "../theme/theme";

export default function AuthScreen() {
  const { requestOtp, verifyOtp, pendingEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heroAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(200, [
      Animated.spring(heroAnim, { toValue: 1, tension: 55, friction: 9, useNativeDriver: true }),
      Animated.spring(cardAnim, { toValue: 1, tension: 55, friction: 9, useNativeDriver: true }),
    ]).start();
  }, []);

  async function handleRequestCode() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await requestOtp(email.trim().toLowerCase());
    } catch (e: any) {
      setError(e.message ?? "Could not send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setError(null);
    if (code.trim().length < 4) {
      setError("Enter the code from your email.");
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(pendingEmail ?? email.trim().toLowerCase(), code.trim());
    } catch (e: any) {
      setError(e.message ?? "That code didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LinearGradient
        colors={["#1C2712", "#2E3A1F", "#3E4A2F", "#5B6B45", "#8A9A6B", colors.parchment]}
        locations={[0, 0.15, 0.3, 0.5, 0.72, 1]}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Animated.View
            style={[
              styles.hero,
              {
                opacity: heroAnim,
                transform: [
                  {
                    translateY: heroAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.logoWrap}>
              <View style={styles.logoOuter}>
                <View style={styles.logoInner}>
                  <Text style={styles.logoGlyph}>✦</Text>
                </View>
              </View>
            </View>
            <Text style={styles.brand}>The Living Olive</Text>
            <Text style={styles.tagline}>Scripture · Hymns · Devotion · Prayer</Text>
          </Animated.View>

          {/* Card */}
          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardAnim,
                transform: [
                  {
                    translateY: cardAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {!pendingEmail ? (
              <>
                <Text style={styles.cardTitle}>Welcome back</Text>
                <Text style={styles.cardSubtitle}>
                  Enter your email — we'll send a one-time sign-in code.
                </Text>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.inkFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="send"
                  onSubmitEditing={handleRequestCode}
                />
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={handleRequestCode}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.parchment} />
                  ) : (
                    <Text style={styles.buttonText}>Send sign-in code</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Check your inbox</Text>
                <Text style={styles.cardSubtitle}>
                  We sent a code to{"\n"}
                  <Text style={styles.emailHighlight}>{pendingEmail}</Text>
                </Text>
                <Text style={styles.label}>One-time code</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="000000"
                  placeholderTextColor={colors.inkFaint}
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={setCode}
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handleVerify}
                />
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={handleVerify}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.parchment} />
                  ) : (
                    <Text style={styles.buttonText}>Verify & continue</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => setCode("")} hitSlop={8}>
                  <Text style={styles.backLink}>← Use a different email</Text>
                </Pressable>
              </>
            )}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </Animated.View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <Text style={styles.poweredBy}>POWERED BY SYNTAX</Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 80,
    paddingBottom: 40,
    justifyContent: "center",
  },
  hero: { alignItems: "center", marginBottom: spacing.xxl },
  logoWrap: { marginBottom: spacing.lg },
  logoOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoGlyph: { fontSize: 26, color: "#E2C060" },
  brand: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.white,
    letterSpacing: -0.6,
    marginBottom: spacing.xs,
  },
  tagline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    ...shadows.cardLg,
    marginBottom: spacing.xl,
  },
  cardTitle: {
    ...typography.title,
    color: colors.oliveDark,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...typography.bodySmall,
    color: colors.inkSoft,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  emailHighlight: { color: colors.oliveDark, fontWeight: "600" },
  label: {
    ...typography.caption,
    color: colors.inkSoft,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.parchment,
    marginBottom: spacing.md,
  },
  codeInput: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 8,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.oliveDark,
    borderRadius: radii.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  buttonText: {
    color: colors.parchment,
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  backLink: {
    color: colors.oliveLight,
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.xs,
    fontWeight: "500",
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.sm,
    fontWeight: "500",
  },
  footer: { alignItems: "center", marginTop: spacing.md },
  footerLine: {
    width: 32,
    height: 1,
    backgroundColor: colors.oliveFaint,
    marginBottom: spacing.sm,
  },
  poweredBy: {
    ...typography.micro,
    color: colors.oliveLight,
    letterSpacing: 2,
  },
});
