import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  ActivityIndicator, FlatList, RefreshControl, Linking, Alert,
  Image, Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import {
  fetchChurches, fetchMyChurch, setMyChurch, clearMyChurch,
  fetchTodayBulletin, fetchBulletinArchive, fetchBulletin,
  fetchChurchExtras,
  initiateBulletinPayment, verifyBulletinPayment,
  type Church, type Bulletin, type ChurchExtras,
} from "../../lib/api";
import { colors, spacing, radii, typography, shadows } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Bulletin">;

// ── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonBox({ width, height, style, borderRadius: br }: {
  width?: number | string; height?: number; style?: object; borderRadius?: number;
}) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      style={[{
        backgroundColor: colors.parchmentDark,
        borderRadius: br ?? 8,
        width: width ?? "100%",
        height: height ?? 16,
        opacity,
      }, style]}
    />
  );
}

// ── Skeleton for bulletin card ────────────────────────────────────────────────
function BulletinSkeleton() {
  return (
    <View style={{ padding: spacing.lg }}>
      {/* today card skeleton */}
      <SkeletonBox height={10} width={80} style={{ marginBottom: 12 }} />
      <SkeletonBox height={140} borderRadius={radii.xl} style={{ marginBottom: spacing.xl }} />
      {/* announcements skeleton */}
      <SkeletonBox height={10} width={100} style={{ marginBottom: 12 }} />
      <SkeletonBox height={70} borderRadius={radii.lg} style={{ marginBottom: 8 }} />
      <SkeletonBox height={70} borderRadius={radii.lg} style={{ marginBottom: spacing.xl }} />
      {/* archive skeleton */}
      <SkeletonBox height={10} width={120} style={{ marginBottom: 12 }} />
      <SkeletonBox height={56} borderRadius={radii.lg} style={{ marginBottom: 8 }} />
      <SkeletonBox height={56} borderRadius={radii.lg} style={{ marginBottom: 8 }} />
      <SkeletonBox height={56} borderRadius={radii.lg} />
    </View>
  );
}

// ── Announcement type badge ───────────────────────────────────────────────────
const ANNOUNCEMENT_COLORS: Record<string, { bg: string; text: string }> = {
  general:   { bg: "#EFF4E9", text: "#3E4A2F" },
  urgent:    { bg: "#FDECEA", text: "#8B1C1C" },
  event:     { bg: "#FEF6D6", text: "#7A5F0D" },
  reminder:  { bg: "#E8F4F8", text: "#1C4A5C" },
};

export default function BulletinScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<"loading" | "picker" | "askConfirm" | "bulletin">("loading");
  const [churches, setChurches] = useState<Church[]>([]);
  const [selectedChurch, setSelectedChurch] = useState<Church | null>(null);
  const [myChurch, setMyChurchState] = useState<Church | null>(null);
  const [todayBulletin, setTodayBulletin] = useState<Bulletin | null>(null);
  const [archive, setArchive] = useState<Bulletin[]>([]);
  const [extras, setExtras] = useState<ChurchExtras>({ announcements: [], orderOfService: [], social: {} });
  const [viewingBulletin, setViewingBulletin] = useState<Bulletin | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payingFor, setPayingFor] = useState<string | null>(null);

  useEffect(() => { bootstrap(); }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      const membership = await fetchMyChurch();
      if (membership?.churches) {
        const church = membership.churches as Church;
        setMyChurchState(church);
        setSelectedChurch(church);
        await loadAll(church.id);
        setPhase("bulletin");
      } else {
        const list = await fetchChurches();
        setChurches(list);
        setPhase("picker");
      }
    } catch {
      // Silent fallback — show picker so user can try again
      try {
        const list = await fetchChurches();
        setChurches(list);
      } catch { /* no internet, show empty picker */ }
      setPhase("picker");
    } finally {
      setLoading(false);
    }
  }

  async function loadAll(churchId: string) {
    const [todayRes, archiveRes] = await Promise.allSettled([
      fetchTodayBulletin(churchId),
      fetchBulletinArchive(churchId),
    ]);
    if (todayRes.status === "fulfilled") setTodayBulletin(todayRes.value.bulletin);
    if (archiveRes.status === "fulfilled") setArchive(archiveRes.value.bulletins);
    // Extras load in background — don't block the main bulletin display
    setExtrasLoading(true);
    fetchChurchExtras(churchId)
      .then(setExtras)
      .catch(() => { /* silent — extras are supplementary */ })
      .finally(() => setExtrasLoading(false));
  }

  async function onSelectChurch(church: Church) {
    setSelectedChurch(church);
    setLoading(true);
    try {
      await loadAll(church.id);
      if (!myChurch) setPhase("askConfirm");
      else setPhase("bulletin");
    } catch {
      setPhase("bulletin");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmChurch(yes: boolean) {
    if (yes && selectedChurch) {
      try { await setMyChurch(selectedChurch.id); } catch { /* silent */ }
      setMyChurchState(selectedChurch);
    }
    setPhase("bulletin");
  }

  async function onChangeChurch() {
    try { await clearMyChurch(); } catch { /* silent */ }
    setMyChurchState(null);
    setSelectedChurch(null);
    setExtras({ announcements: [], orderOfService: [], social: {} });
    setPhase("loading");
    setLoading(true);
    try {
      const list = await fetchChurches();
      setChurches(list);
    } catch { /* silent */ }
    setLoading(false);
    setPhase("picker");
  }

  async function onRefresh() {
    if (!selectedChurch) return;
    setRefreshing(true);
    try { await loadAll(selectedChurch.id); } catch { /* silent */ }
    setRefreshing(false);
  }

  async function openBulletin(bulletin: Bulletin) {
    if (!selectedChurch) return;
    setLoading(true);
    try {
      const res = await fetchBulletin(selectedChurch.id, bulletin.id);
      setViewingBulletin(res.bulletin);
    } catch {
      // Silent — user sees nothing broken, they can tap again
    } finally {
      setLoading(false);
    }
  }

  async function payForBulletin(bulletin: Bulletin) {
    if (!selectedChurch) return;
    setPayingFor(bulletin.id);
    try {
      const res = await initiateBulletinPayment(bulletin.id);
      await Linking.openURL(res.paymentLink);
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
                  openBulletin(bulletin);
                } else {
                  Alert.alert("Payment not confirmed", "Payment was not completed. Please try again.");
                }
              } catch {
                Alert.alert("Verification issue", "Please check your connection and try again.");
              } finally {
                setPayingFor(null);
              }
            },
          },
        ]
      );
    } catch {
      Alert.alert("Payment unavailable", "Please check your connection and try again.");
      setPayingFor(null);
    }
  }

  // ── Loading phase ────────────────────────────────────────────────────────────
  if (phase === "loading" || loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#1C2712", "#3E4A2F"]} style={styles.bulletinHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.bulletinHeaderTitle}>📋 Bulletin</Text>
          <SkeletonBox height={14} width={160} style={{ marginTop: 4, backgroundColor: "rgba(255,255,255,0.15)" }} />
        </LinearGradient>
        <BulletinSkeleton />
      </View>
    );
  }

  // ── Church picker ────────────────────────────────────────────────────────────
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

        {churches.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No bulletins yet</Text>
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
                {item.logo_url ? (
                  <Image source={{ uri: item.logo_url }} style={styles.churchLogo} resizeMode="contain" />
                ) : (
                  <View style={styles.churchIconWrap}>
                    <Text style={styles.churchIcon}>⛪</Text>
                  </View>
                )}
                <View style={styles.churchBody}>
                  <Text style={styles.churchName}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.churchDesc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                </View>
                <Text style={styles.churchArrow}>›</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  // ── Confirm church ───────────────────────────────────────────────────────────
  if (phase === "askConfirm") {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#1C2712", "#3E4A2F"]} style={styles.pickerHeader}>
          <Text style={styles.pickerTitle}>Is this your church?</Text>
        </LinearGradient>
        <View style={styles.confirmCard}>
          {selectedChurch?.logo_url ? (
            <Image source={{ uri: selectedChurch.logo_url }} style={styles.confirmLogo} resizeMode="contain" />
          ) : (
            <Text style={styles.confirmIcon}>⛪</Text>
          )}
          <Text style={styles.confirmChurchName}>{selectedChurch?.name}</Text>
          <Text style={styles.confirmQuestion}>Is {selectedChurch?.name} your place of worship?</Text>
          <Text style={styles.confirmHint}>
            If you say Yes, you'll be taken directly to their bulletin next time.
          </Text>
          <Pressable style={[styles.confirmBtn, styles.confirmBtnYes]} onPress={() => onConfirmChurch(true)}>
            <Text style={styles.confirmBtnTextYes}>Yes, this is my church</Text>
          </Pressable>
          <Pressable style={[styles.confirmBtn, styles.confirmBtnNo]} onPress={() => onConfirmChurch(false)}>
            <Text style={styles.confirmBtnTextNo}>No, just browsing</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Bulletin view ────────────────────────────────────────────────────────────
  const hasSocialLinks = extras.social &&
    Object.values(extras.social).some((v) => !!v);
  const hasOrderOfService = extras.orderOfService && extras.orderOfService.length > 0;
  const hasAnnouncements = extras.announcements && extras.announcements.length > 0;

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
                {viewingBulletin.publish_at
                  ? ` · ${new Date(viewingBulletin.publish_at).toLocaleDateString()}`
                  : ""}
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
                <Text style={styles.bulletinBodyText}>
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
        {/* ── Header ── */}
        <LinearGradient colors={["#1C2712", "#3E4A2F"]} style={styles.bulletinHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </Pressable>
          <View style={styles.bulletinHeaderRow}>
            {selectedChurch?.logo_url ? (
              <Image source={{ uri: selectedChurch.logo_url }} style={styles.headerLogo} resizeMode="contain" />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.bulletinHeaderTitle}>📋 Bulletin</Text>
              <Text style={styles.bulletinChurchName}>{selectedChurch?.name}</Text>
            </View>
          </View>
          <Pressable onPress={onChangeChurch} style={styles.changeChurchBtn}>
            <Text style={styles.changeChurchText}>Change church</Text>
          </Pressable>
        </LinearGradient>

        <View style={styles.bulletinBody2}>

          {/* ── Announcements ── */}
          {extrasLoading && !hasAnnouncements ? (
            <>
              <SkeletonBox height={10} width={100} style={{ marginBottom: 10 }} />
              <SkeletonBox height={68} borderRadius={radii.lg} style={{ marginBottom: 8 }} />
              <SkeletonBox height={68} borderRadius={radii.lg} style={{ marginBottom: spacing.xl }} />
            </>
          ) : hasAnnouncements ? (
            <>
              <Text style={styles.sectionLabel}>ANNOUNCEMENTS</Text>
              {extras.announcements.map((ann) => {
                const palette = ANNOUNCEMENT_COLORS[ann.type] ?? ANNOUNCEMENT_COLORS.general;
                return (
                  <View key={ann.id} style={[styles.announcementCard, { backgroundColor: palette.bg }]}>
                    <View style={styles.announcementLeft}>
                      <Text style={[styles.announcementType, { color: palette.text }]}>
                        {ann.type?.toUpperCase() ?? "NOTICE"}
                      </Text>
                      <Text style={styles.announcementText}>{ann.text}</Text>
                    </View>
                  </View>
                );
              })}
              <View style={styles.sectionSpacer} />
            </>
          ) : null}

          {/* ── Today's bulletin ── */}
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
                <Text style={styles.readMore}>
                  {todayBulletin.hasAccess ? "Read bulletin →" : "View →"}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={styles.noBulletinCard}>
              <Text style={styles.noBulletinIcon}>📭</Text>
              <Text style={styles.noBulletinTitle}>No bulletin today</Text>
              <Text style={styles.noBulletinDesc}>
                {selectedChurch?.name} hasn't published a bulletin for today yet.
              </Text>
            </View>
          )}

          {/* ── Order of service ── */}
          {hasOrderOfService && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>ORDER OF SERVICE</Text>
              <View style={styles.oosCard}>
                {extras.orderOfService.map((item, i) => (
                  <View key={i} style={[styles.oosRow, i < extras.orderOfService.length - 1 && styles.oosRowBorder]}>
                    {item.time ? (
                      <Text style={styles.oosTime}>{item.time}</Text>
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.oosItem}>{item.item}</Text>
                      {item.notes ? <Text style={styles.oosNotes}>{item.notes}</Text> : null}
                    </View>
                    {i === 0 ? null : (
                      <View style={styles.oosDot} />
                    )}
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Archive ── */}
          <View style={[styles.archiveHeader, hasOrderOfService && { marginTop: spacing.xl }]}>
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
                {b.is_paid && <Text style={styles.archivePaid}>₦{b.price_ngn?.toLocaleString()}</Text>}
                <Text style={styles.archiveArrow}>›</Text>
              </Pressable>
            ))
          )}
          {showArchive && (
            <Pressable
              onPress={() => setShowArchive(false)}
              style={{ alignItems: "center", paddingVertical: spacing.md }}
            >
              <Text style={{ color: colors.inkFaint, fontSize: 13 }}>Show less</Text>
            </Pressable>
          )}

          {/* ── Social links ── */}
          {hasSocialLinks && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>CONNECT WITH US</Text>
              <View style={styles.socialRow}>
                {extras.social.website && (
                  <Pressable style={styles.socialBtn} onPress={() => Linking.openURL(extras.social.website!)}>
                    <Text style={styles.socialBtnIcon}>🌐</Text>
                    <Text style={styles.socialBtnLabel}>Website</Text>
                  </Pressable>
                )}
                {extras.social.facebook && (
                  <Pressable style={styles.socialBtn} onPress={() => Linking.openURL(extras.social.facebook!)}>
                    <Text style={styles.socialBtnIcon}>📘</Text>
                    <Text style={styles.socialBtnLabel}>Facebook</Text>
                  </Pressable>
                )}
                {extras.social.instagram && (
                  <Pressable style={styles.socialBtn} onPress={() => Linking.openURL(extras.social.instagram!)}>
                    <Text style={styles.socialBtnIcon}>📸</Text>
                    <Text style={styles.socialBtnLabel}>Instagram</Text>
                  </Pressable>
                )}
                {extras.social.twitter && (
                  <Pressable style={styles.socialBtn} onPress={() => Linking.openURL(extras.social.twitter!)}>
                    <Text style={styles.socialBtnIcon}>🐦</Text>
                    <Text style={styles.socialBtnLabel}>Twitter / X</Text>
                  </Pressable>
                )}
                {extras.social.youtube && (
                  <Pressable style={styles.socialBtn} onPress={() => Linking.openURL(extras.social.youtube!)}>
                    <Text style={styles.socialBtnIcon}>▶️</Text>
                    <Text style={styles.socialBtnLabel}>YouTube</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}

          {/* ── Quick access ── */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>EXPLORE</Text>
          <View style={styles.exploreRow}>
            <Pressable
              style={({ pressed }) => [styles.exploreBtn, pressed && styles.pressed]}
              onPress={() => navigation.navigate("BibleHome" as any)}
            >
              <Text style={styles.exploreBtnIcon}>📖</Text>
              <Text style={styles.exploreBtnLabel}>Bible</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.exploreBtn, pressed && styles.pressed]}
              onPress={() => navigation.navigate("Prayer" as any)}
            >
              <Text style={styles.exploreBtnIcon}>🙏</Text>
              <Text style={styles.exploreBtnLabel}>Prayer</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.exploreBtn, pressed && styles.pressed]}
              onPress={() => navigation.navigate("HymnsList" as any)}
            >
              <Text style={styles.exploreBtnIcon}>🎵</Text>
              <Text style={styles.exploreBtnLabel}>Hymns</Text>
            </Pressable>
          </View>

          <View style={{ height: spacing.xxxl }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.parchment },

  // Picker
  pickerHeader: { paddingTop: 60, paddingBottom: 28, paddingHorizontal: spacing.lg },
  pickerTitle: { fontSize: 26, fontWeight: "700", color: colors.white, marginBottom: 6 },
  pickerSub: { ...typography.bodySmall, color: "rgba(255,255,255,0.6)" },
  backBtn: { marginBottom: 12 },
  backBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: "500" },

  churchCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.white,
    borderRadius: radii.xl, overflow: "hidden", ...shadows.card,
  },
  churchLogo: { width: 60, height: 64, backgroundColor: colors.oliveFaint },
  churchIconWrap: { width: 60, height: 64, alignItems: "center", justifyContent: "center", backgroundColor: colors.oliveFaint },
  churchIcon: { fontSize: 24 },
  churchBody: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  churchName: { ...typography.subtitle, color: colors.ink },
  churchDesc: { ...typography.bodySmall, color: colors.inkFaint, marginTop: 3 },
  churchArrow: { fontSize: 24, color: colors.oliveFaint, fontWeight: "300", paddingRight: spacing.md },

  // Confirm
  confirmCard: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  confirmLogo: { width: 80, height: 80, borderRadius: radii.lg, marginBottom: 16 },
  confirmIcon: { fontSize: 56, marginBottom: 16 },
  confirmChurchName: { fontSize: 22, fontWeight: "700", color: colors.ink, textAlign: "center", marginBottom: 16 },
  confirmQuestion: { ...typography.subtitle, color: colors.ink, textAlign: "center", marginBottom: 12 },
  confirmHint: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center", marginBottom: 32, lineHeight: 22 },
  confirmBtn: { width: "100%", borderRadius: radii.xl, paddingVertical: spacing.md, alignItems: "center", marginBottom: 12 },
  confirmBtnYes: { backgroundColor: colors.olive },
  confirmBtnNo: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.parchmentDark },
  confirmBtnTextYes: { color: colors.white, fontWeight: "700", fontSize: 16 },
  confirmBtnTextNo: { color: colors.inkSoft, fontWeight: "500", fontSize: 15 },

  // Bulletin header
  bulletinHeader: { paddingTop: 60, paddingBottom: 24, paddingHorizontal: spacing.lg },
  bulletinHeaderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: 6 },
  headerLogo: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: "rgba(255,255,255,0.1)" },
  bulletinHeaderTitle: { fontSize: 22, fontWeight: "700", color: colors.white },
  bulletinChurchName: { ...typography.bodySmall, color: "rgba(255,255,255,0.7)" },
  changeChurchBtn: {
    marginTop: 10, alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: radii.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
  },
  changeChurchText: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  bulletinBody2: { padding: spacing.lg },
  sectionLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: 12, marginTop: 4 },
  sectionSpacer: { height: spacing.xl },

  // Announcements
  announcementCard: {
    borderRadius: radii.lg, padding: spacing.md, marginBottom: 8,
    borderLeftWidth: 4, borderLeftColor: colors.olive,
  },
  announcementLeft: { flex: 1 },
  announcementType: {
    fontSize: 10, fontWeight: "700", letterSpacing: 1.2,
    marginBottom: 4, textTransform: "uppercase",
  },
  announcementText: { ...typography.bodySmall, color: colors.ink, lineHeight: 22 },

  // Today's bulletin
  todayCard: { borderRadius: radii.xl, overflow: "hidden", ...shadows.cardLg, marginBottom: spacing.xl },
  todayCardGrad: { padding: spacing.lg },
  todayCardRow: { flexDirection: "row", gap: spacing.md },
  todayCardFrequency: { ...typography.micro, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 6 },
  todayCardTitle: { fontSize: 20, fontWeight: "700", color: colors.white, marginBottom: 8 },
  todayCardPreview: { ...typography.bodySmall, color: "rgba(255,255,255,0.75)", lineHeight: 22 },
  paidBadge: {
    backgroundColor: colors.gold, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radii.pill, alignSelf: "flex-start",
  },
  paidBadgeText: { fontSize: 11, fontWeight: "700", color: colors.ink },
  readMore: { color: "#E2C060", fontWeight: "600", marginTop: spacing.md, fontSize: 14 },

  noBulletinCard: {
    backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.xl,
    alignItems: "center", ...shadows.card, marginBottom: spacing.xl,
  },
  noBulletinIcon: { fontSize: 36, marginBottom: 12 },
  noBulletinTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  noBulletinDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center", lineHeight: 22 },

  // Order of service
  oosCard: {
    backgroundColor: colors.white, borderRadius: radii.xl,
    overflow: "hidden", ...shadows.card, marginBottom: 4,
  },
  oosRow: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    gap: spacing.md,
  },
  oosRowBorder: { borderTopWidth: 1, borderTopColor: colors.parchmentDark },
  oosTime: {
    fontSize: 12, fontWeight: "700", color: colors.gold,
    width: 52, paddingTop: 2,
  },
  oosItem: { ...typography.bodySmall, color: colors.ink, fontWeight: "600", marginBottom: 2 },
  oosNotes: { fontSize: 12, color: colors.inkFaint, lineHeight: 18 },
  oosDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.oliveLight, marginTop: 8,
  },

  // Archive
  archiveHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  showArchiveBtn: { color: colors.olive, fontWeight: "600", fontSize: 13 },
  noArchiveText: { ...typography.bodySmall, color: colors.inkFaint, textAlign: "center", paddingVertical: spacing.lg },
  archiveCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.white,
    borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.subtle,
  },
  archiveTitle: { ...typography.bodySmall, color: colors.ink, fontWeight: "600", marginBottom: 3 },
  archiveMeta: { fontSize: 12, color: colors.inkFaint },
  archivePaid: { fontSize: 12, fontWeight: "700", color: colors.gold, marginRight: 8 },
  archiveArrow: { fontSize: 20, color: colors.oliveFaint, fontWeight: "300" },

  // Social links
  socialRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: 4 },
  socialBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.white, borderRadius: radii.lg,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    ...shadows.subtle,
  },
  socialBtnIcon: { fontSize: 18 },
  socialBtnLabel: { fontSize: 13, fontWeight: "600", color: colors.ink },

  // Explore quick-links
  exploreRow: { flexDirection: "row", gap: spacing.md },
  exploreBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.white, borderRadius: radii.xl,
    paddingVertical: spacing.lg, ...shadows.card,
  },
  exploreBtnIcon: { fontSize: 28, marginBottom: 6 },
  exploreBtnLabel: { fontSize: 13, fontWeight: "600", color: colors.olive },

  // Bulletin modal
  modalHeader: { paddingTop: 52, paddingBottom: 20, paddingHorizontal: spacing.lg },
  modalTitle: { fontSize: 20, fontWeight: "700", color: colors.white, marginTop: 8, marginBottom: 4 },
  modalMeta: { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  bulletinContent: { padding: spacing.lg },
  bulletinBodyText: { ...typography.body, color: colors.ink, lineHeight: 28 },

  // Paywall
  paywallBox: { alignItems: "center", padding: spacing.xl },
  paywallIcon: { fontSize: 48, marginBottom: 16 },
  paywallTitle: { ...typography.title, color: colors.ink, marginBottom: 12 },
  paywallDesc: { ...typography.body, color: colors.inkSoft, textAlign: "center", lineHeight: 26, marginBottom: 32 },
  payBtn: {
    backgroundColor: colors.olive, borderRadius: radii.xl, paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl, minWidth: 220, alignItems: "center",
  },
  payBtnText: { color: colors.white, fontWeight: "700", fontSize: 16 },

  pressed: { opacity: 0.88, transform: [{ scale: 0.975 }] },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  emptyDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center" },
});
