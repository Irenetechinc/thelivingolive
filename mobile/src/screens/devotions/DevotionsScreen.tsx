import React, { useCallback, useRef, useEffect, useState } from "react";
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
import { generateDevotion, submitGenerationFeedback } from "../../lib/api";
import { scheduleRecurringReminder } from "../../lib/notifications";
import { consumePendingAlarm } from "../../lib/alarmState";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";

type Duration = "daily" | "weekly" | "monthly" | "yearly";
const durations: { id: Duration; label: string; icon: string }[] = [
  { id: "daily", label: "Daily", icon: "☀" },
  { id: "weekly", label: "Weekly", icon: "◎" },
  { id: "monthly", label: "Monthly", icon: "◐" },
  { id: "yearly", label: "Yearly", icon: "✦" },
];

type DevotionEntry = {
  id: string;
  title: string;
  scripture_reference: string | null;
  scripture_text: string | null;
  body: string;
  closing_prayer: string | null;
  created_at: string;
  // Only present for entries generated in this session (see PrayerScreen for
  // why this isn't a persisted column) — used to send feedback to the
  // self-learning engine.
  category?: string;
  sourceText?: string;
};

function StarRating({ onRate }: { onRate: (rating: number) => void }) {
  const [given, setGiven] = useState<number | null>(null);
  if (given !== null) {
    return <Text style={styles.feedbackThanks}>Thanks — this helps the devotion engine learn ✦</Text>;
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

function EntryCard({ entry, index }: { entry: DevotionEntry; index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      tension: 60,
      friction: 9,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      <View style={styles.card}>
        {entry.scripture_reference ? (
          <View style={styles.scriptureTag}>
            <Text style={styles.scriptureTagText}>{entry.scripture_reference}</Text>
          </View>
        ) : null}
        <Text style={styles.cardTitle}>{entry.title}</Text>
        {entry.scripture_text ? (
          <View style={styles.scriptureQuote}>
            <View style={styles.quoteBar} />
            <Text style={styles.scriptureText}>{entry.scripture_text}</Text>
          </View>
        ) : null}
        <Text style={styles.cardBody}>{entry.body}</Text>
        {entry.closing_prayer ? (
          <View style={styles.prayerWrap}>
            <Text style={styles.prayerLabel}>CLOSING PRAYER</Text>
            <Text style={styles.prayerText}>{entry.closing_prayer}</Text>
          </View>
        ) : null}
        {entry.category ? (
          <StarRating
            onRate={(rating) =>
              submitGenerationFeedback({
                entryType: "devotion",
                category: entry.category!,
                verseRef: entry.scripture_reference ?? undefined,
                rating,
                sourceText: entry.sourceText,
              }).catch(() => {})
            }
          />
        ) : null}
        <Text style={styles.cardDate}>
          {new Date(entry.created_at).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function DevotionsScreen() {
  const [goal, setGoal] = useState("");
  const [duration, setDuration] = useState<Duration>("daily");
  const [hour12, setHour12] = useState("6");
  const [minute, setMinute] = useState("30");
  const [amPm, setAmPm] = useState<"AM" | "PM">("AM");
  const [ringtone, setRingtone] = useState<"default" | "gentle" | "bell" | "silent">("default");
  const [alarmBanner, setAlarmBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<DevotionEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (busy) {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1400, useNativeDriver: true })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [busy]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // Check for alarm-triggered navigation. When the server pre-generates
      // content (entryId present), the entries are already in Supabase — just
      // load them. No "tap to generate" prompt needed.
      const alarm = consumePendingAlarm();
      if (alarm?.type === "devotion" && Date.now() - alarm.timestamp < 120000) {
        if (!alarm.entryId && alarm.goal) {
          // Legacy push without pre-generated content — prefill form
          setGoal(alarm.goal);
          setAlarmBanner(true);
        }
        // entryId case: content already in DB, will appear when entries load below
      }
      (async () => {
        setLoadingEntries(true);
        const { data } = await supabase
          .from("devotion_entries")
          .select("id, title, scripture_reference, scripture_text, body, closing_prayer, created_at")
          .order("created_at", { ascending: false })
          .limit(20);
        if (active) {
          setEntries(data ?? []);
          setLoadingEntries(false);
        }
      })();
      return () => { active = false; };
    }, [])
  );

  async function handleGenerate() {
    setError(null);
    if (!goal.trim()) { setError("Describe your spiritual goal first."); return; }
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
        .from("devotion_plans")
        .insert({ user_id: userData.user.id, goal: goal.trim(), duration, preferred_time: `${h}:${m.toString().padStart(2, "0")}:00` })
        .select().single();
      if (planError) throw planError;
      const result = await generateDevotion({ goal: goal.trim(), duration });
      const { data: entry, error: entryError } = await supabase
        .from("devotion_entries")
        .insert({
          plan_id: plan.id, user_id: userData.user.id,
          title: result.title, scripture_reference: result.scriptureReference,
          scripture_text: result.scriptureText, body: result.body, closing_prayer: result.closingPrayer,
        })
        .select().single();
      if (entryError) throw entryError;
      const enriched: DevotionEntry = {
        ...entry,
        category: result.detectedCategory,
        sourceText: goal.trim(),
      };
      setEntries((prev) => [enriched, ...prev]);
      await scheduleRecurringReminder({
        identifier: `devotion-${plan.id}`,
        title: "Time for your devotion 🌿",
        body: result.title,
        hour: h, minute: m, frequency: duration,
        sound: ringtone,
        data: { type: "devotion", goal: goal.trim() },
      });
      setAlarmBanner(false);
      setGoal("");
    } catch (e: any) {
      setError(e.message ?? "Couldn't generate your devotion. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={["#5B4010", "#8A6A10", "#C9A227", "#E2C060"]}
        locations={[0, 0.35, 0.7, 1]}
        style={styles.header}
      >
        <Text style={styles.headerEyebrow}>SPIRIT-GUIDED</Text>
        <Text style={styles.headerTitle}>Daily Devotions</Text>
        <Text style={styles.headerSub}>Scripture-rooted reflections for your spiritual journey</Text>
      </LinearGradient>

      <View style={styles.body}>
        {alarmBanner && (
          <View style={styles.alarmBanner}>
            <Text style={styles.alarmBannerText}>🌿 Your devotion reminder fired — your goal is pre-filled below. Tap Generate to create today's devotion.</Text>
          </View>
        )}
        {/* Form card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>New devotion</Text>

          <Text style={styles.fieldLabel}>SPIRITUAL GOAL</Text>
          <TextInput
            style={styles.textarea}
            placeholder="e.g. Growing in patience during trials, deepening my prayer life…"
            placeholderTextColor={colors.inkFaint}
            multiline
            value={goal}
            onChangeText={setGoal}
            textAlignVertical="top"
          />

          <Text style={styles.fieldLabel}>FREQUENCY</Text>
          <View style={styles.chipRow}>
            {durations.map((d) => (
              <Pressable
                key={d.id}
                style={[styles.chip, duration === d.id && styles.chipActive]}
                onPress={() => setDuration(d.id)}
              >
                <Text style={[styles.chipIcon, duration === d.id && styles.chipIconActive]}>
                  {d.icon}
                </Text>
                <Text style={[styles.chipText, duration === d.id && styles.chipTextActive]}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>

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
              placeholder="30"
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
            style={({ pressed }) => [styles.generateBtn, pressed && styles.generateBtnPressed, busy && styles.generateBtnBusy]}
            onPress={handleGenerate}
            disabled={busy}
          >
            <LinearGradient
              colors={busy ? [colors.inkFaint, colors.inkSoft] : ["#5B4010", "#C9A227"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.generateBtnGrad}
            >
              {busy ? (
                <>
                  <ActivityIndicator color={colors.parchment} size="small" />
                  <Text style={styles.generateBtnText}>Generating devotion…</Text>
                </>
              ) : (
                <Text style={styles.generateBtnText}>Generate devotion ✦</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        {/* Entries */}
        {loadingEntries ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
        ) : entries.length > 0 ? (
          <View style={styles.historySection}>
            <View style={styles.sectionHeadRow}>
              <View style={styles.sectionLine} />
              <Text style={styles.sectionHeadLabel}>PAST DEVOTIONS</Text>
              <View style={styles.sectionLine} />
            </View>
            {entries.map((e, i) => (
              <EntryCard key={e.id} entry={e} index={i} />
            ))}
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
    paddingBottom: spacing.xl + 8,
  },
  headerEyebrow: { ...typography.micro, color: "rgba(255,255,255,0.55)", letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: colors.white, letterSpacing: -0.4, marginBottom: 4 },
  headerSub: { ...typography.caption, color: "rgba(255,255,255,0.6)" },
  body: { padding: spacing.lg },
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
  chipRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.parchment,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
  },
  chipActive: { backgroundColor: colors.oliveDark, borderColor: colors.oliveDark },
  chipIcon: { fontSize: 14, color: colors.inkSoft },
  chipIconActive: { color: colors.goldLight },
  chipText: { ...typography.caption, color: colors.inkSoft, textTransform: "capitalize" },
  chipTextActive: { color: colors.parchment, fontWeight: "700" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  timeInput: {
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    width: 52,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  timeSep: { fontSize: 22, fontWeight: "700", color: colors.ink },
  amPmRow: { flexDirection: "row", gap: 3, marginLeft: spacing.xs },
  amPmBtn: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.parchment,
    borderWidth: 1.5,
    borderColor: colors.parchmentDark,
  },
  amPmBtnActive: { backgroundColor: colors.olive, borderColor: colors.olive },
  amPmText: { fontSize: 12, fontWeight: "700", color: colors.inkSoft },
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
  alarmBanner: {
    backgroundColor: "#EDF2E0",
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "#C2D4A0",
  },
  alarmBannerText: { ...typography.bodySmall, color: colors.oliveDark, lineHeight: 20 },
  errorText: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm, fontWeight: "500" },
  generateBtn: { borderRadius: radii.md, overflow: "hidden", ...shadows.card },
  generateBtnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  generateBtnBusy: {},
  generateBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md + 2,
    gap: spacing.sm,
  },
  generateBtnText: { color: colors.parchment, fontWeight: "700", fontSize: 16, letterSpacing: 0.2 },
  historySection: { marginBottom: spacing.xxl },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.parchmentDark },
  sectionHeadLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.subtle,
  },
  scriptureTag: {
    alignSelf: "flex-start",
    backgroundColor: colors.terracotta,
    borderRadius: radii.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  scriptureTagText: { ...typography.micro, color: colors.white, letterSpacing: 0.5 },
  cardTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: spacing.sm },
  scriptureQuote: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.parchment,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  quoteBar: { width: 3, borderRadius: 2, backgroundColor: colors.gold },
  scriptureText: { ...typography.bodySmall, color: colors.inkSoft, flex: 1, fontStyle: "italic", lineHeight: 20 },
  cardBody: { ...typography.bodySmall, color: colors.ink, lineHeight: 22 },
  prayerWrap: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.parchmentMid,
  },
  prayerLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: 4 },
  prayerText: { ...typography.bodySmall, color: colors.inkSoft, fontStyle: "italic", lineHeight: 20 },
  cardDate: { ...typography.micro, color: colors.inkFaint, marginTop: spacing.sm, textAlign: "right" },
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
