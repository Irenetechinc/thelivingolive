import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, ActivityIndicator, Linking, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { initiateDonation, verifyDonation } from "../../lib/api";
import { colors, spacing, radii, typography, shadows } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Donate">;

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000];

const FUND_BREAKDOWN = [
  { label: "AI & infrastructure", pct: 55, color: colors.olive },
  { label: "Team & operations", pct: 25, color: colors.oliveLight },
  { label: "Research & improvement", pct: 20, color: colors.gold },
];

export default function DonateScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [loading, setLoading] = useState(false);

  const displayAmount = customAmount ? parseInt(customAmount, 10) || 0 : amount;

  async function handleDonate() {
    if (!displayAmount || displayAmount < 100) {
      Alert.alert("Minimum amount", "Please enter at least ₦100.");
      return;
    }
    setLoading(true);
    try {
      const res = await initiateDonation({ amount: displayAmount, isRecurring });
      await Linking.openURL(res.paymentLink);

      Alert.alert(
        "Confirm donation",
        "Did you complete the payment?",
        [
          { text: "Not yet", style: "cancel", onPress: () => setLoading(false) },
          {
            text: "Yes, verify",
            onPress: async () => {
              try {
                const verify = await verifyDonation({ txRef: res.txRef });
                if (verify.paid) {
                  Alert.alert(
                    "Thank you",
                    `Your ₦${verify.amount?.toLocaleString()} gift has been received. Every contribution helps keep The Living Olive running for everyone.`,
                    [{ text: "Done", onPress: () => navigation.goBack() }]
                  );
                } else {
                  Alert.alert("Not confirmed", "We couldn't confirm the payment. Try again or contact support.");
                }
              } catch (e: any) {
                Alert.alert("Error", e.message);
              } finally {
                setLoading(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient
        colors={["#1C2712", "#2E3A1F", "#3E4A2F"]}
        style={[styles.header, { paddingTop: 60 + insets.top }]}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Support The Living Olive</Text>
        <Text style={styles.headerSub}>
          Your gift helps keep The Living Olive free for every believer — covering servers, AI, and the team behind it.
        </Text>
      </LinearGradient>

      {/* Fund breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Where your gift goes</Text>
        <View style={styles.breakdownCard}>
          {FUND_BREAKDOWN.map((item) => (
            <View key={item.label} style={styles.breakdownRow}>
              <View style={styles.breakdownLabelRow}>
                <Text style={styles.breakdownLabel}>{item.label}</Text>
                <Text style={[styles.breakdownPct, { color: item.color }]}>{item.pct}%</Text>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${item.pct}%` as any, backgroundColor: item.color }]} />
              </View>
            </View>
          ))}
          <Text style={styles.breakdownNote}>
            100% transparent — every rand and naira goes directly to keeping the app running.
          </Text>
        </View>
      </View>

      {/* Amount picker */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Choose an amount</Text>
        <View style={styles.presetRow}>
          {PRESET_AMOUNTS.map((a) => (
            <Pressable
              key={a}
              style={[styles.presetBtn, amount === a && !customAmount && styles.presetBtnActive]}
              onPress={() => { setAmount(a); setCustomAmount(""); }}
            >
              <Text style={[styles.presetText, amount === a && !customAmount && styles.presetTextActive]}>
                ₦{a.toLocaleString()}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.customInput}
          placeholder="Enter a custom amount (₦)"
          placeholderTextColor={colors.inkFaint}
          keyboardType="numeric"
          value={customAmount}
          onChangeText={(t) => { setCustomAmount(t.replace(/[^0-9]/g, "")); setAmount(0); }}
        />
      </View>

      {/* Recurring toggle */}
      <View style={styles.section}>
        <Pressable style={styles.recurringRow} onPress={() => setIsRecurring(!isRecurring)}>
          <View style={[styles.toggle, isRecurring && styles.toggleOn]}>
            <View style={[styles.toggleThumb, isRecurring && styles.toggleThumbOn]} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.recurringLabel}>Make this a monthly gift</Text>
            <Text style={styles.recurringHint}>Consistent support helps us plan and build for the long term</Text>
          </View>
        </Pressable>
      </View>

      {/* Donate button */}
      <View style={styles.section}>
        <Pressable
          style={[styles.donateBtn, loading && { opacity: 0.7 }]}
          onPress={handleDonate}
          disabled={loading}
        >
          <LinearGradient colors={["#3E4A2F", "#5B6B45"]} style={styles.donateBtnGrad}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Text style={styles.donateBtnText}>
                  Give {displayAmount ? `₦${displayAmount.toLocaleString()}` : ""}
                  {isRecurring ? " / month" : ""}
                </Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
        <Text style={styles.secureNote}>Secured by Flutterwave · Card, Bank Transfer, USSD</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  content: {},
  header: { paddingBottom: 36, paddingHorizontal: spacing.lg },
  backBtn: { marginBottom: 20 },
  backBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: "500" },
  headerTitle: { fontSize: 26, fontWeight: "700", color: colors.white, marginBottom: 10, lineHeight: 32 },
  headerSub: { ...typography.bodySmall, color: "rgba(255,255,255,0.65)", lineHeight: 22 },

  section: { padding: spacing.lg, paddingTop: spacing.xl },
  sectionTitle: { ...typography.subtitle, color: colors.ink, marginBottom: spacing.md },

  breakdownCard: {
    backgroundColor: colors.white, borderRadius: radii.xl,
    padding: spacing.lg, gap: spacing.md, ...shadows.card,
  },
  breakdownRow: { gap: 6 },
  breakdownLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownLabel: { ...typography.bodySmall, color: colors.ink },
  breakdownPct: { ...typography.caption, fontWeight: "700" },
  barBg: { height: 5, backgroundColor: colors.oliveFaint, borderRadius: 3 },
  barFill: { height: 5, borderRadius: 3 },
  breakdownNote: {
    ...typography.caption, color: colors.inkFaint, lineHeight: 18,
    borderTopWidth: 1, borderTopColor: colors.parchmentDark,
    paddingTop: spacing.sm, marginTop: spacing.xs,
  },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  presetBtn: {
    paddingVertical: 10, paddingHorizontal: 18,
    borderRadius: radii.pill, borderWidth: 1,
    borderColor: colors.parchmentDark, backgroundColor: colors.white,
  },
  presetBtnActive: { backgroundColor: colors.olive, borderColor: colors.olive },
  presetText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  presetTextActive: { color: colors.white },
  customInput: {
    backgroundColor: colors.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.parchmentDark,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    fontSize: 16, color: colors.ink,
  },

  recurringRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.white, borderRadius: radii.xl,
    padding: spacing.lg, ...shadows.subtle,
  },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: colors.parchmentDark, justifyContent: "center", padding: 3,
  },
  toggleOn: { backgroundColor: colors.olive },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  toggleThumbOn: { alignSelf: "flex-end" },
  recurringLabel: { ...typography.bodySmall, color: colors.ink, fontWeight: "600", marginBottom: 3 },
  recurringHint: { fontSize: 12, color: colors.inkFaint, lineHeight: 18 },

  donateBtn: { borderRadius: radii.xl, overflow: "hidden", ...shadows.cardLg },
  donateBtnGrad: { paddingVertical: 18, alignItems: "center" },
  donateBtnText: { fontSize: 17, fontWeight: "700", color: colors.white, letterSpacing: 0.2 },
  secureNote: { textAlign: "center", ...typography.caption, color: colors.inkFaint, marginTop: spacing.md },
});
