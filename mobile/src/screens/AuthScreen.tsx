import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing, typography } from "../theme/theme";

export default function AuthScreen() {
  const { requestOtp, verifyOtp, pendingEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.hero}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoGlyph}>🫒</Text>
        </View>
        <Text style={styles.title}>The Living Olive</Text>
        <Text style={styles.subtitle}>Scripture, hymns, devotion & prayer — rooted daily.</Text>
      </View>

      <View style={styles.card}>
        {!pendingEmail ? (
          <>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.inkSoft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Pressable style={styles.button} onPress={handleRequestCode} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Send sign-in code</Text>}
            </Pressable>
            <Text style={styles.hint}>No password needed — we'll email you a one-time code.</Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>Enter the code sent to {pendingEmail}</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor={colors.inkSoft}
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />
            <Pressable style={styles.button} onPress={handleVerify} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Verify & continue</Text>}
            </Pressable>
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment, padding: spacing.lg, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: spacing.xl },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.oliveLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  logoGlyph: { fontSize: 34 },
  title: { ...typography.display, color: colors.oliveDark, textAlign: "center" },
  subtitle: { ...typography.body, color: colors.inkSoft, textAlign: "center", marginTop: spacing.xs },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  label: { ...typography.subtitle, color: colors.ink, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    borderRadius: radii.sm,
    padding: spacing.md,
    fontSize: 16,
    marginBottom: spacing.md,
    color: colors.ink,
  },
  button: {
    backgroundColor: colors.olive,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  buttonText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  hint: { ...typography.caption, color: colors.inkSoft, marginTop: spacing.sm, textAlign: "center" },
  error: { color: colors.danger, marginTop: spacing.sm, textAlign: "center" },
});
