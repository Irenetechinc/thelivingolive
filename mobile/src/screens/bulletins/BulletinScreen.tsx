import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  ActivityIndicator, FlatList, RefreshControl, Linking, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import {
  fetchChurches, fetchMyChurch, setMyChurch, clearMyChurch,
  fetchTodayBulletin, fetchBulletinArchive, fetchBulletin,
  initiateBulletinPayment, verifyBulletinPayment,
  type Church, type Bulletin,
} from "../../lib/api";
import { colors, spacing, radii, typography, shadows } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Bulletin">;

const CHURCH_PREF_KEY = "lo_church_confirmed";

export default function BulletinScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<"loading" | "picker" | "askConfirm" | "bulletin">("loading");
  const [churches, setChurches] = useState<Church[]>([]);
  const [selectedChurch, setSelectedChurch] = useState<Church | null>(null);
  const [myChurch, setMyChurchState] = useState<Church | null>(null);
  const [todayBulletin, setTodayBulletin] = useState<Bulletin | null>(null);
  const [archive, setArchive] = useState<Bulletin[]>([]);
  const [viewingBulletin, setViewingBulletin] = useState<Bulletin | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payingFor, setPayingFor] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Load state on mount
  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      // Check if user has a confirmed home church
      const membership = await fetchMyChurch();
      if (membership?.churches) {
        const church = membership.churches as Church;
        setMyChurchState(church);
        setSelectedChurch(church);
        await loadTodayAndArchive(church.id);
        setPhase("bulletin");
      } else {
        // Show church picker
        const list = await fetchChurches();
        setChurches(list);
        setPhase("picker");
      }
    } catch (e: any) {
      setErrorMsg(e.message);
      setPhase("picker");
    } finally {
      setLoading(false);
    }
  }

  async function loadTodayAndArchive(churchId: string) {
    const [todayRes, archiveRes] = await Promise.allSettled([
      fetchTodayBulletin(churchId),
      fetchBulletinArchive(churchId),
    ]);
    if (todayRes.status === "fulfilled") setTodayBulletin(todayRes.value.bulletin);
    if (archiveRes.status === "fulfilled") setArchive(archiveRes.value.bulletins);
  }

  async function onSelectChurch(church: Church) {
    setSelectedChurch(church);
    setLoading(true);
    try {
      await loadTodayAndArchive(church.id);
      // Ask if this is their church
      if (!myChurch) setPhase("askConfirm");
      else setPhase("bulletin");
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmChurch(yes: boolean) {
    if (yes && selectedChurch) {
      await setMyChurch(selectedChurch.id);
      setMyChurchState(selectedChurch);
    } else {
      // user said No — don't save, but still show the bulletin this session
    }
    setPhase("bulletin");
  }

  async function onChangeChurch() {
    await clearMyChurch();
    setMyChurchState(null);
    setSelectedChurch(null);
    const list = await fetchChurches();
    setChurches(list);
    setPhase("picker");
  }

  async function onRefresh() {
    if (!selectedChurch) return;
    setRefreshing(true);
    await loadTodayAndArchive(selectedChurch.id);
    setRefreshing(false);
  }

  async function openBulletin(bulletin: Bulletin) {
    if (!selectedChurch) return;
    setLoading(true);
    try {
      const res = await fetchBulletin(selectedChurch.id, bulletin.id);
      setViewingBulletin(res.bulletin);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function payForBulletin(bulletin: Bulletin) {
    if (!selectedChurch) return;
    setPayingFor(bulletin.id);
    try {
      const res = await initiateBulletinPayment(bulletin.id);
      // Open Flutterwave hosted checkout in system browser
      await Linking.openURL(res.paymentLink);
      // After user returns, verify
      Alert.alert(
        "Verify Payment",
        "Did you complete the payment?",
        [
          { text: "Not yet", style: "cancel", onPress: () => setPayingFor(null) },
          {
            text: "Yes, verify",
            onPress: async () => {
              try {
                const verify = await verifyBulletinPayment(bulletin.id, res.txRef);
                if (verify.paid) {
                  // Reload bulletin with full content
                  openBulletin(bulletin);
                } else {
                  Alert.alert("Payment not confirmed", "Payment was not completed. Try again.");
                }
              } catch (e: any) {
                Alert.alert("Error", e.message);
              } finally {
                setPayingFor(null);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", e.message);
      setPayingFor(null);
    }
  }

  // ── Render: loading ──────────────────────────────────────────────────────────
  if (phase === "loading" || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.loadingText}>Loading bulletins…</Text>
      </View>
    );
  }

  // ── Render: church picker ────────────────────────────────────────────────────
  if (phase === "picker") {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#1C2712", "#3E4A2F"]} style={styles.pickerHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.pickerTitle}>Select Your Church</Text>
          <Text style={styles.pickerSub}>Choose your place of worship to view their bulletin</Text>
        </LinearGradient>

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

        {churches.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No bulletins available yet</Text>
            <Text style={styles.emptyDesc}>No churches have published bulletins at this time.</Text>
          </View>
        ) : (
          <FlatList
            data={churches}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.churchCard, pressed && styles.pressed]}
                onPress={() => onSelectChurch(item)}
              >
                <View style={styles.churchIconWrap}>
                  <Text style={styles.churchIcon}>⛪</Text>
                </View>
                <View style={styles.churchBody}>
                  <Text style={styles.churchName}>{item.name}</Text>
                  {item.description ? <Text style={styles.churchDesc} numberOfLines={2}>{item.description}</Text> : null}
                </View>
                <Text style={styles.churchArrow}>›</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  // ── Render: confirm church ───────────────────────────────────────────────────
  if (phase === "askConfirm") {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#1C2712", "#3E4A2F"]} style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Is this your church?</Text>
        </LinearGradient>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmIcon}>⛪</Text>
          <Text style={styles.confirmChurchName}>{selectedChurch?.name}</Text>
          <Text style={styles.confirmQuestion}>
            Is {selectedChurch?.name} your place of worship?
          </Text>
          <Text style={styles.confirmHint}>
            If you say Yes, you'll be taken directly to their bulletin next time without this prompt.
          </Text>
          <Pressable
            style={[styles.confirmBtn, styles.confirmBtnYes]}
            onPress={() => onConfirmChurch(true)}
          >
            <Text style={styles.confirmBtnTextYes}>Yes, this is my church</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmBtn, styles.confirmBtnNo]}
            onPress={() => onConfirmChurch(false)}
          >
            <Text style={styles.confirmBtnTextNo}>No, just browsing</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Render: bulletin view ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Full bulletin viewer modal */}
      <Modal visible={!!viewingBulletin} animationType="slide" presentationStyle="pageSheet">
        {viewingBulletin && (
          <View style={{ flex: 1, backgroundColor: colors.parchment }}>
            <LinearGradient colors={["#1C2712", "#3E4A2F"]} style={styles.modalHeader}>
              <Pressable onPress={() => setViewingBulletin(null)} style={styles.backBtn}>
                <Text style={styles.backBtnText}>✕ Close</Text>
              </Pressable>
              <Text style={styles.modalTitle} numberOfLines={2}>{viewingBulletin.title}</Text>
              <Text style={styles.modalMeta}>
                {selectedChurch?.name} · {viewingBulletin.frequency}
                {viewingBulletin.publish_at ? ` · ${new Date(viewingBulletin.publish_at).toLocaleDateString()}` : ""}
              </Text>
            </LinearGradient>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.bulletinContent}>
              {viewingBulletin.requiresPayment ? (
                <View style={styles.paywallBox}>
                  <Text style={styles.paywallIcon}>🔒</Text>
                  <Text style={styles.paywallTitle}>Paid Bulletin</Text>
                  <Text style={styles.paywallDesc}>
                    This bulletin is available for ₦{viewingBulletin.price_ngn?.toLocaleString() ?? "—"}.
                    Purchase to read the full content.
                  </Text>
                  <Pressable
                    style={[styles.payBtn, payingFor === viewingBulletin.id && { opacity: 0.6 }]}
                    onPress={() => payForBulletin(viewingBulletin)}
                    disabled={payingFor === viewingBulletin.id}
                  >
                    {payingFor === viewingBulletin.id
                      ? <ActivityIndicator color={colors.white} />
                      : <Text style={styles.payBtnText}>Pay ₦{viewingBulletin.price_ngn?.toLocaleString()} to Read</Text>
                    }
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.bulletinBody}>
                  {(viewingBulletin.content ?? "").replace(/<[^>]+>/g, "\n").replace(/\n{3,}/g, "\n\n").trim()}
                </Text>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      >
        {/* Header */}
        <LinearGradient colors={["#1C2712", "#3E4A2F"]} style={styles.bulletinHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.bulletinHeaderTitle}>📋 Bulletin</Text>
          <Text style={styles.bulletinChurchName}>{selectedChurch?.name}</Text>
          <Pressable onPress={onChangeChurch} style={styles.changeChurchBtn}>
            <Text style={styles.changeChurchText}>Change church</Text>
          </Pressable>
        </LinearGradient>

        <View style={styles.bulletinBody2}>
          {/* Today's bulletin */}
          <Text style={styles.sectionLabel}>TODAY'S BULLETIN</Text>
          {todayBulletin ? (
            <Pressable
              style={({ pressed }) => [styles.todayCard, pressed && styles.pressed]}
              onPress={() => openBulletin(todayBulletin)}
            >
              <LinearGradient colors={["#3E4A2F", "#5B6B45"]} style={styles.todayCardGrad}>
                <View style={styles.todayCardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.todayCardFrequency}>{todayBulletin.frequency?.toUpperCase() ?? "BULLETIN"}</Text>
                    <Text style={styles.todayCardTitle}>{todayBulletin.title}</Text>
                    {todayBulletin.content_preview ? (
                      <Text style={styles.todayCardPreview} numberOfLines={3}>{todayBulletin.content_preview}</Text>
                    ) : null}
                  </View>
                  {todayBulletin.is_paid && (
                    <View style={styles.paidBadge}>
                      <Text style={styles.paidBadgeText}>₦{todayBulletin.price_ngn?.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.readMore}>{todayBulletin.hasAccess ? "Read bulletin →" : "View →"}</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={styles.noBulletinCard}>
              <Text style={styles.noBulletinIcon}>📭</Text>
              <Text style={styles.noBulletinTitle}>No bulletin today</Text>
              <Text style={styles.noBulletinDesc}>
                {selectedChurch?.name} hasn't published a bulletin for today yet. Check the archive for past editions.
              </Text>
            </View>
          )}

          {/* Archive */}
          <View style={styles.archiveHeader}>
            <Text style={styles.sectionLabel}>PREVIOUS BULLETINS</Text>
            {!showArchive && archive.length > 0 && (
              <Pressable onPress={() => setShowArchive(true)}>
                <Text style={styles.showArchiveBtn}>Show all</Text>
              </Pressable>
            )}
          </View>

          {archive.length === 0 ? (
            <Text style={styles.noArchiveText}>No previous bulletins available.</Text>
          ) : (
            (showArchive ? archive : archive.slice(0, 3)).map((b) => (
              <Pressable
                key={b.id}
                style={({ pressed }) => [styles.archiveCard, pressed && styles.pressed]}
                onPress={() => openBulletin(b)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.archiveTitle}>{b.title}</Text>
                  <Text style={styles.archiveMeta}>
                    {b.frequency} · {b.publish_at ? new Date(b.publish_at).toLocaleDateString() : ""}
                  </Text>
                </View>
                {b.is_paid && (
                  <Text style={styles.archivePaid}>₦{b.price_ngn?.toLocaleString()}</Text>
                )}
                <Text style={styles.archiveArrow}>›</Text>
              </Pressable>
            ))
          )}
          {showArchive && (
            <Pressable onPress={() => setShowArchive(false)} style={{ alignItems: "center", paddingVertical: spacing.md }}>
              <Text style={{ color: colors.inkFaint, fontSize: 13 }}>Show less</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.parchment },
  loadingText: { ...typography.bodySmall, color: colors.inkFaint, marginTop: spacing.md },

  // Picker
  pickerHeader: { paddingTop: 60, paddingBottom: 28, paddingHorizontal: spacing.lg },
  pickerTitle: { fontSize: 26, fontWeight: "700", color: colors.white, marginBottom: 6 },
  pickerSub: { ...typography.bodySmall, color: "rgba(255,255,255,0.6)" },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: "500" },

  churchCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderRadius: radii.xl, overflow: "hidden", ...shadows.card },
  churchIconWrap: { width: 60, height: 64, alignItems: "center", justifyContent: "center", backgroundColor: colors.oliveFaint },
  churchIcon: { fontSize: 24 },
  churchBody: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  churchName: { ...typography.subtitle, color: colors.ink },
  churchDesc: { ...typography.bodySmall, color: colors.inkFaint, marginTop: 3 },
  churchArrow: { fontSize: 24, color: colors.oliveFaint, fontWeight: "300", paddingRight: spacing.md },

  // Confirm
  confirmCard: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  confirmIcon: { fontSize: 56, marginBottom: 16 },
  confirmChurchName: { fontSize: 22, fontWeight: "700", color: colors.ink, textAlign: "center", marginBottom: 16 },
  confirmQuestion: { ...typography.subtitle, color: colors.ink, textAlign: "center", marginBottom: 12 },
  confirmHint: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center", marginBottom: 32, lineHeight: 22 },
  confirmBtn: { width: "100%", borderRadius: radii.xl, paddingVertical: spacing.md, alignItems: "center", marginBottom: 12 },
  confirmBtnYes: { backgroundColor: colors.olive },
  confirmBtnNo: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.parchmentDark },
  confirmBtnTextYes: { color: colors.white, fontWeight: "700", fontSize: 16 },
  confirmBtnTextNo: { color: colors.inkSoft, fontWeight: "500", fontSize: 15 },

  // Bulletin view
  bulletinHeader: { paddingTop: 60, paddingBottom: 24, paddingHorizontal: spacing.lg },
  bulletinHeaderTitle: { fontSize: 22, fontWeight: "700", color: colors.white, marginBottom: 4 },
  bulletinChurchName: { ...typography.bodySmall, color: "rgba(255,255,255,0.7)" },
  changeChurchBtn: { marginTop: 10, alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  changeChurchText: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  bulletinBody2: { padding: spacing.lg },
  sectionLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: 12, marginTop: 8 },

  todayCard: { borderRadius: radii.xl, overflow: "hidden", ...shadows.cardLg, marginBottom: spacing.xl },
  todayCardGrad: { padding: spacing.lg },
  todayCardRow: { flexDirection: "row", gap: spacing.md },
  todayCardFrequency: { ...typography.micro, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 6 },
  todayCardTitle: { fontSize: 20, fontWeight: "700", color: colors.white, marginBottom: 8 },
  todayCardPreview: { ...typography.bodySmall, color: "rgba(255,255,255,0.75)", lineHeight: 22 },
  paidBadge: { backgroundColor: colors.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, alignSelf: "flex-start" },
  paidBadgeText: { fontSize: 11, fontWeight: "700", color: colors.ink },
  readMore: { color: colors.goldLight, fontWeight: "600", marginTop: spacing.md, fontSize: 14 },

  noBulletinCard: { backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.xl, alignItems: "center", ...shadows.card, marginBottom: spacing.xl },
  noBulletinIcon: { fontSize: 36, marginBottom: 12 },
  noBulletinTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  noBulletinDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center", lineHeight: 22 },

  archiveHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  showArchiveBtn: { color: colors.olive, fontWeight: "600", fontSize: 13 },
  noArchiveText: { ...typography.bodySmall, color: colors.inkFaint, textAlign: "center", paddingVertical: spacing.lg },
  archiveCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.subtle },
  archiveTitle: { ...typography.bodySmall, color: colors.ink, fontWeight: "600", marginBottom: 3 },
  archiveMeta: { fontSize: 12, color: colors.inkFaint },
  archivePaid: { fontSize: 12, fontWeight: "700", color: colors.gold, marginRight: 8 },
  archiveArrow: { fontSize: 20, color: colors.oliveFaint, fontWeight: "300" },

  // Modal
  modalHeader: { paddingTop: 52, paddingBottom: 20, paddingHorizontal: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.white, marginTop: 8, marginBottom: 4 },
  modalMeta: { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  bulletinContent: { padding: spacing.lg },
  bulletinBody: { ...typography.body, color: colors.ink, lineHeight: 28 },

  // Paywall
  paywallBox: { alignItems: "center", padding: spacing.xl },
  paywallIcon: { fontSize: 48, marginBottom: 16 },
  paywallTitle: { ...typography.title, color: colors.ink, marginBottom: 12 },
  paywallDesc: { ...typography.body, color: colors.inkSoft, textAlign: "center", lineHeight: 26, marginBottom: 32 },
  payBtn: { backgroundColor: colors.olive, borderRadius: radii.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minWidth: 220, alignItems: "center" },
  payBtnText: { color: colors.white, fontWeight: "700", fontSize: 16 },

  errorText: { color: colors.danger, padding: spacing.lg, textAlign: "center" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.975 }] },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  emptyDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center" },
});
