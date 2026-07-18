import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, ActivityIndicator, Linking, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { initiateDonation, verifyDonation } from "../../lib/api";
import { colors, spacing, radii, typography, shadows } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Donate">;

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000];

const FUND_BREAKDOWN = [
  { icon: "⚙️", label: "API & AI maintenance", pct: 30 },
  { icon: "🗄️", label: "Database & infrastructure", pct: 25 },
  { icon: "👥", label: "Team & operations", pct: 25 },
  { icon: "🤖", label: "AI model improvement", pct: 20 },
];

export default function DonateScreen({ navigation }: Props) {
  const [amount, setAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingTxRef, setPendingTxRef] = useState<string | null>(null);

  const displayAmount = customAmount ? parseInt(customAmount, 10) || 0 : amount;

  async function handleDonate() {
    if (!displayAmount || displayAmount < 100) {
      Alert.alert("Minimum donation is ₦100");
      return;
    }
    setLoading(true);
    try {
      const res = await initiateDonation({ amount: displayAmount, isRecurring });
      setPendingTxRef(res.txRef);
      await Linking.openURL(res.paymentLink);

      // Prompt to verify once user returns from browser
      Alert.alert(
        "Verify Donation",
        "Did you complete the donation?",
        [
          { text: "Not yet", style: "cancel", onPress: () => setLoading(false) },
          {
            text: "Yes, verify",
            onPress: async () => {
              try {
                const verify = await verifyDonation({ txRef: res.txRef });
                if (verify.paid) {
                  Alert.alert(
                    "Thank you! 🙏",
                    `Your ₦${verify.amount?.toLocaleString()} donation has been received. Every contribution goes directly toward keeping Living Olive running and improving for everyone.`,
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient colors={["#1C2712", "#3E4A2F", "#5B6B45"]} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerIcon}>🫒</Text>
        <Text style={styles.headerTitle}>Support Living Olive</Text>
        <Text style={styles.headerSub}>
          Help keep Living Olive running — your donations fuel our mission.
          Every contribution goes toward maintaining and improving the app for everyone.
        </Text>
      </LinearGradient>

      {/* Fund breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Where your donation goes</Text>
        <View style={styles.breakdownCard}>
          {FUND_BREAKDOWN.map((item) => (
            <View key={item.label} style={styles.breakdownRow}>
              <Text style={styles.breakdownIcon}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.breakdownLabelRow}>
                  <Text style={styles.breakdownLabel}>{item.label}</Text>
                  <Text style={styles.breakdownPct}>{item.pct}%</Text>
                </View>
                <View style={styles.barBg}>
                  <View style={[styles.barFill, { width: `${item.pct}%` as any }]} />
                </View>
              </View>
            </View>
          ))}
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
          placeholder="Or enter custom amount (₦)"
          placeholderTextColor={colors.inkFaint}
          keyboardType="numeric"
          value={customAmount}
          onChangeText={(t) => { setCustomAmount(t.replace(/[^0-9]/g, "")); setAmount(0); }}
        />
      </View>

      {/* Recurring toggle */}
      <View style={styles.section}>
        <Pressable
          style={styles.recurringRow}
          onPress={() => setIsRecurring(!isRecurring)}
        >
          <View style={[styles.toggle, isRecurring && styles.toggleOn]}>
            <View style={[styles.toggleThumb, isRecurring && styles.toggleThumbOn]} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.recurringLabel}>Make this a monthly donation</Text>
            <Text style={styles.recurringHint}>Support us consistently to help plan for the long term</Text>
          </View>
        </Pressable>
      </View>

      {/* Donate button */}
      <View style={styles.section}>
        <Text style={styles.transparencyNote}>
          ✦ 100% transparent — we build Living Olive in the open and welcome your trust.
          You are a partner in this mission, not just a donor.
        </Text>

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
                  Donate {displayAmount ? `₦${displayAmount.toLocaleString()}` : ""}
                </Text>
                {isRecurring && <Text style={styles.donateBtnSub}>monthly</Text>}
              </>
            )}
          </LinearGradient>
        </Pressable>

        <Text style={styles.secureNote}>🔒 Secured by Flutterwave · Card, Bank Transfer, USSD, Mobile Money</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  content: { paddingBottom: 60 },
  header: { paddingTop: 60, paddingBottom: 36, paddingHorizontal: spacing.lg },
  backBtn: { marginBottom: 20 },
  backBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: "500" },
  headerIcon: { fontSize: 48, marginBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: "700", color: colors.white, marginBottom: 12 },
  headerSub: { ...typography.body, color: "rgba(255,255,255,0.7)", lineHeight: 26 },

  section: { padding: spacing.lg, paddingTop: spacing.xl },
  sectionTitle: { ...typography.subtitle, color: colors.ink, marginBottom: spacing.md },

  breakdownCard: { backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.md, ...shadows.card },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  breakdownIcon: { fontSize: 20, width: 28 },
  breakdownLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  breakdownLabel: { ...typography.bodySmall, color: colors.ink },
  breakdownPct: { ...typography.caption, color: colors.gold, fontWeight: "700" },
  barBg: { height: 4, backgroundColor: colors.oliveFaint, borderRadius: 2 },
  barFill: { height: 4, backgroundColor: colors.olive, borderRadius: 2 },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  presetBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.parchmentDark, backgroundColor: colors.white },
  presetBtnActive: { backgroundColor: colors.olive, borderColor: colors.olive },
  presetText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  presetTextActive: { color: colors.white },
  customInput: { backgroundColor: colors.white, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.parchmentDark, paddingHorizontal: spacing.md, paddingVertical: 14, fontSize: 16, color: colors.ink },

  recurringRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg, ...shadows.subtle },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.parchmentDark, justifyContent: "center", padding: 3 },
  toggleOn: { backgroundColor: colors.olive },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.white },
  toggleThumbOn: { alignSelf: "flex-end" },
  recurringLabel: { ...typography.bodySmall, color: colors.ink, fontWeight: "600", marginBottom: 3 },
  recurringHint: { fontSize: 12, color: colors.inkFaint, lineHeight: 18 },

  transparencyNote: { ...typography.bodySmall, color: colors.inkSoft, lineHeight: 22, marginBottom: spacing.lg, fontStyle: "italic" },
  donateBtn: { borderRadius: radii.xl, overflow: "hidden", ...shadows.cardLg },
  donateBtnGrad: { paddingVertical: 18, alignItems: "center" },
  donateBtnText: { fontSize: 18, fontWeight: "700", color: colors.white },
  donateBtnSub: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 3 },
  secureNote: { textAlign: "center", ...typography.caption, color: colors.inkFaint, marginTop: spacing.md },
});
