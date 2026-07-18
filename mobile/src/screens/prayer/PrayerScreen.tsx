import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { generatePrayer, submitGenerationFeedback } from "../../lib/api";
import { scheduleRecurringReminder } from "../../lib/notifications";
import { consumePendingAlarm } from "../../lib/alarmState";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";

const prayerTypes: { id: string; label: string; symbol: string; gradient: [string, string] }[] = [
  { id: "Warfare", label: "Warfare", symbol: "⚔", gradient: ["#6B2020", "#B03030"] },
  { id: "Adoration", label: "Adoration", symbol: "✦", gradient: ["#5B4010", "#C9A227"] },
  { id: "Intercession", label: "Intercession", symbol: "◎", gradient: ["#2A3820", "#5B6B45"] },
  { id: "Thanksgiving", label: "Thanksgiving", symbol: "♡", gradient: ["#9A3F1F", "#C1693A"] },
  { id: "Petition", label: "Petition", symbol: "✿", gradient: ["#1C3045", "#3A6090"] },
];

type PrayerEntry = {
  id: string;
  title: string;
  prayer_text: string;
  scripture_reference: string | null;
  created_at: string;
  // Only present for entries generated in this session — used to send
  // feedback to the self-learning engine. Not a persisted DB column.
  category?: string;
  sourceText?: string;
};

function StarRating({ onRate }: { onRate: (rating: number) => void }) {
  const [given, setGiven] = useState<number | null>(null);
  if (given !== null) {
    return <Text style={styles.feedbackThanks}>Thanks — this helps the prayer engine learn ✦</Text>;
  }
  return (
    <View style={styles.starRow}>
      <Text style={styles.starPrompt}>Was this helpful?</Text>
      <View style={{ flexDirection: "row", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => { setGiven(n); onRate(n); }} hitSlop={4}>
            <Text style={styles.star}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PrayerCard({ entry, index }: { entry: PrayerEntry; index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1, tension: 60, friction: 9,
      delay: index * 60, useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    }}>
      <View style={styles.prayerCard}>
        <Text style={styles.prayerCardTitle}>{entry.title}</Text>
        <Text style={styles.prayerCardBody}>{entry.prayer_text}</Text>
        {entry.scripture_reference ? (
          <View style={styles.scriptureRow}>
            <Text style={styles.scriptureIcon}>✦</Text>
            <Text style={styles.scriptureRef}>{entry.scripture_reference}</Text>
          </View>
        ) : null}
        {entry.category ? (
          <StarRating
            onRate={(rating) =>
              submitGenerationFeedback({
                entryType: "prayer",
                category: entry.category!,
                verseRef: entry.scripture_reference ?? undefined,
                rating,
                sourceText: entry.sourceText,
              }).catch(() => {})
            }
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

export default function PrayerScreen() {
  const [desires, setDesires] = useState("");
  const [count, setCount] = useState("3");
  const [type, setType] = useState(prayerTypes[0].id);
  const [hour12, setHour12] = useState("6");
  const [minute, setMinute] = useState("0");
  const [amPm, setAmPm] = useState<"AM" | "PM">("AM");
  const [ringtone, setRingtone] = useState<"default" | "gentle" | "bell" | "silent">("default");
  const [alarmBanner, setAlarmBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<PrayerEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Check for alarm-triggered navigation. When the server pre-generates
      // content (entryId present), the entries are already in Supabase — just
      // load them. No "tap to generate" prompt needed.
      const alarm = consumePendingAlarm();
      if (alarm?.type === "prayer" && Date.now() - alarm.timestamp < 120000) {
        if (!alarm.entryId && alarm.desires) {
          // Legacy push without pre-generated content — prefill form
          setDesires(alarm.desires);
          setAlarmBanner(true);
        }
        // entryId case: content already in DB, will appear when entries load below
      }
      (async () => {
        setLoadingEntries(true);
        const { data } = await supabase
          .from("prayer_entries")
          .select("id, title, prayer_text, scripture_reference, created_at")
          .order("created_at", { ascending: false })
          .limit(30);
        if (active) { setEntries(data ?? []); setLoadingEntries(false); }
      })();
      return () => { active = false; };
    }, [])
  );

  async function handleGenerate() {
    setError(null);
    if (!desires.trim()) { setError("Share the desire of your heart first."); return; }
    const n = parseInt(count, 10);
    if (Number.isNaN(n) || n < 1 || n > 10) { setError("Prayer points must be between 1 and 10."); return; }

    // Convert 12h + AM/PM to 24h
    const h12Num = parseInt(hour12, 10);
    const m = parseInt(minute, 10);
    if (Number.isNaN(h12Num) || h12Num < 1 || h12Num > 12 || Number.isNaN(m) || m < 0 || m > 59) {
      setError("Enter a valid time (1–12 for hour, 0–59 for minutes)."); return;
    }
    const h = amPm === "AM" ? (h12Num === 12 ? 0 : h12Num) : (h12Num === 12 ? 12 : h12Num + 12);

    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const { data: plan, error: planError } = await supabase
        .from("prayer_plans")
        .insert({ user_id: userData.user.id, desires: desires.trim(), prayer_type: type, point_count: n, preferred_time: `${h}:${m.toString().padStart(2, "0")}:00` })
        .select().single();
      if (planError) throw planError;
      const result = await generatePrayer({ desires: desires.trim(), count: n, type });
      const rows = result.prayerPoints.map((p) => ({
        plan_id: plan.id, user_id: userData.user!.id,
        title: p.title, prayer_text: p.prayerText, scripture_reference: p.scriptureReference,
      }));
      const { data: inserted, error: insertError } = await supabase.from("prayer_entries").insert(rows).select();
      if (insertError) throw insertError;
      const desiresText = desires.trim();
      const category = result.detectedCategory ?? type;
      const withCategory: PrayerEntry[] = (inserted ?? []).map((row, i) => ({
        ...row,
        category: result.prayerPoints[i]?.category ?? category,
        sourceText: desiresText,
      }));
      setEntries((prev) => [...withCategory, ...prev]);
      await scheduleRecurringReminder({
        identifier: `prayer-${plan.id}`,
        title: "Time to pray 🙏",
        body: `${type} prayer points are ready`,
        hour: h, minute: m, frequency: "daily",
        sound: ringtone,
        data: { type: "prayer", desires: desiresText },
      });
      setAlarmBanner(false);
      setDesires("");
    } catch (e: any) {
      setError(e.message ?? "Couldn't generate prayers. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedType = prayerTypes.find((t) => t.id === type) ?? prayerTypes[0];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={[selectedType.gradient[0], selectedType.gradient[1], selectedType.gradient[1] + "99"] as [string, string, string]}
        locations={[0, 0.65, 1]}
        style={styles.header}
      >
        <Text style={styles.headerEyebrow}>SPIRIT-GUIDED</Text>
        <Text style={styles.headerTitle}>Prayer Points</Text>
        <Text style={styles.headerSub}>Bible-rooted prayers for the desires of your heart</Text>

        {/* Prayer type horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.typeScroll}
        >
          {prayerTypes.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.typeChip, type === t.id && styles.typeChipActive]}
              onPress={() => setType(t.id)}
            >
              <Text style={[styles.typeChipSymbol, type === t.id && styles.typeChipSymbolActive]}>
                {t.symbol}
              </Text>
              <Text style={[styles.typeChipText, type === t.id && styles.typeChipTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </LinearGradient>

      <View style={styles.body}>
        {alarmBanner && (
          <View style={styles.alarmBanner}>
            <Text style={styles.alarmBannerText}>🙏 Your prayer reminder fired — your desire is pre-filled below. Tap Generate to create today's prayer points.</Text>
          </View>
        )}

        {/* Form card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{selectedType.label} Prayer</Text>

          <Text style={styles.fieldLabel}>DESIRE OF YOUR HEART</Text>
          <TextInput
            style={styles.textarea}
            placeholder="e.g. Breakthrough in my finances, healing for my family, strength in spiritual battle…"
            placeholderTextColor={colors.inkFaint}
            multiline
            value={desires}
            onChangeText={setDesires}
            textAlignVertical="top"
          />

          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>POINTS</Text>
              <TextInput
                style={styles.countInput}
                value={count}
                onChangeText={setCount}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="3"
                placeholderTextColor={colors.inkFaint}
              />
            </View>
            <View style={[styles.inlineField, { flex: 2 }]}>
              <Text style={styles.fieldLabel}>REMINDER TIME</Text>
              <View style={styles.timeRow}>
                <TextInput
                  style={styles.timeInput}
                  value={hour12}
                  onChangeText={(v) => setHour12(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="6"
                  placeholderTextColor={colors.inkFaint}
                />
                <Text style={styles.timeSep}>:</Text>
                <TextInput
                  style={styles.timeInput}
                  value={minute}
                  onChangeText={(v) => setMinute(v.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="00"
                  placeholderTextColor={colors.inkFaint}
                />
                <View style={styles.amPmRow}>
                  {(["AM", "PM"] as const).map((p) => (
                    <Pressable
                      key={p}
                      style={[styles.amPmBtn, amPm === p && styles.amPmBtnActive]}
                      onPress={() => setAmPm(p)}
                    >
                      <Text style={[styles.amPmText, amPm === p && styles.amPmTextActive]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.fieldLabel}>RINGTONE</Text>
          <View style={styles.ringtoneRow}>
            {(["default", "gentle", "bell", "silent"] as const).map((r) => (
              <Pressable
                key={r}
                style={[styles.ringtoneChip, ringtone === r && styles.ringtoneChipActive]}
                onPress={() => setRingtone(r)}
              >
                <Text style={[styles.ringtoneText, ringtone === r && styles.ringtoneTextActive]}>
                  {r === "default" ? "Default" : r === "gentle" ? "Gentle" : r === "bell" ? "Bell" : "Silent"}
                </Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.generateBtn, pressed && styles.generateBtnPressed]}
            onPress={handleGenerate}
            disabled={busy}
          >
            <LinearGradient
              colors={busy ? [colors.inkFaint, colors.inkSoft] as [string, string] : selectedType.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.generateBtnGrad}
            >
              {busy ? (
                <>
                  <ActivityIndicator color={colors.parchment} size="small" />
                  <Text style={styles.generateBtnText}>Generating prayers…</Text>
                </>
              ) : (
                <Text style={styles.generateBtnText}>Generate {type} prayers</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        {/* Past entries */}
        {loadingEntries ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
        ) : entries.length > 0 ? (
          <View style={styles.historySection}>
            <View style={styles.sectionHeadRow}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionHeadLabel}>PRAYER HISTORY</Text>
              <View style={styles.sectionLine} />
            </View>
            {entries.map((e, i) => <PrayerCard key={e.id} entry={e} index={i} />)}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerEyebrow: { ...typography.micro, color: "rgba(255,255,255,0.55)", letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: colors.white, letterSpacing: -0.4, marginBottom: 4 },
  headerSub: { ...typography.caption, color: "rgba(255,255,255,0.6)", marginBottom: spacing.md },
  typeScroll: { gap: spacing.sm, paddingRight: spacing.md },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  typeChipActive: { backgroundColor: colors.white, borderColor: colors.white },
  typeChipSymbol: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  typeChipSymbolActive: { color: colors.oliveDark },
  typeChipText: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  typeChipTextActive: { color: colors.oliveDark },
  body: { padding: spacing.lg },
  alarmBanner: {
    backgroundColor: "#EDF2E0",
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "#C2D4A0",
  },
  alarmBannerText: { ...typography.bodySmall, color: colors.oliveDark, lineHeight: 20 },
  formCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    ...shadows.card,
    marginBottom: spacing.lg,
  },
  formTitle: { ...typography.title, color: colors.oliveDark, marginBottom: spacing.lg },
  fieldLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: spacing.sm },
  textarea: {
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.parchment,
    minHeight: 80,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  inlineRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  inlineField: { flex: 1 },
  countInput: {
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeInput: {
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    width: 42,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  timeSep: { fontSize: 20, fontWeight: "700", color: colors.ink },
  amPmRow: { flexDirection: "row", gap: 3, marginLeft: 2 },
  amPmBtn: {
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.parchment,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
  },
  amPmBtnActive: { backgroundColor: colors.olive, borderColor: colors.olive },
  amPmText: { fontSize: 11, fontWeight: "700", color: colors.inkSoft },
  amPmTextActive: { color: colors.white },
  ringtoneRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, flexWrap: "wrap" },
  ringtoneChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.parchment,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
  },
  ringtoneChipActive: { backgroundColor: colors.oliveDark, borderColor: colors.oliveDark },
  ringtoneText: { fontSize: 13, fontWeight: "600", color: colors.inkSoft },
  ringtoneTextActive: { color: colors.white },
  errorText: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm, fontWeight: "500" },
  generateBtn: { borderRadius: radii.md, overflow: "hidden", ...shadows.card },
  generateBtnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  generateBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.md + 2, gap: spacing.sm,
  },
  generateBtnText: { color: colors.parchment, fontWeight: "700", fontSize: 16, letterSpacing: 0.2 },
  historySection: { marginBottom: spacing.xxl },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.parchmentDark },
  sectionHeadLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2 },
  prayerCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.subtle,
  },
  prayerCardTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: spacing.sm },
  prayerCardBody: { ...typography.bodySmall, color: colors.ink, lineHeight: 22 },
  scriptureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.parchmentMid,
  },
  scriptureIcon: { color: colors.gold, fontSize: 10 },
  scriptureRef: { ...typography.caption, color: colors.terracotta, fontStyle: "italic" },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.parchmentMid,
  },
  starPrompt: { ...typography.caption, color: colors.inkFaint },
  star: { fontSize: 16, color: colors.gold, marginLeft: 2 },
  feedbackThanks: { ...typography.caption, color: colors.olive, marginTop: spacing.sm, fontStyle: "italic" },
});
