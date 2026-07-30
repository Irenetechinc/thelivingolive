import React, { useCallback, useRef, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView,
  ActivityIndicator, Animated, TouchableOpacity, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { generateDevotion, submitGenerationFeedback } from "../../lib/api";
import { scheduleRecurringReminder } from "../../lib/notifications";
import { consumePendingAlarm } from "../../lib/alarmState";
import { colors, radii, spacing, typography, shadows } from "../../theme/theme";

// ── Types ─────────────────────────────────────────────────────────────────────
type Duration = "daily" | "weekly" | "monthly" | "yearly";
type DevotionEntry = {
  id: string;
  title: string;
  scripture_reference: string | null;
  scripture_text: string | null;
  body: string;
  closing_prayer: string | null;
  created_at: string;
  is_read: boolean;
  category?: string;
  sourceText?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const DURATIONS: { id: Duration; label: string; icon: string }[] = [
  { id: "daily",   label: "Daily",   icon: "☀" },
  { id: "weekly",  label: "Weekly",  icon: "◎" },
  { id: "monthly", label: "Monthly", icon: "◐" },
  { id: "yearly",  label: "Yearly",  icon: "✦" },
];

const DAYS_OPTIONS = [
  { label: "Unlimited", value: null },
  { label: "7 days",    value: 7 },
  { label: "14 days",   value: 14 },
  { label: "30 days",   value: 30 },
  { label: "90 days",   value: 90 },
];

const WEEKDAYS = [
  { label: "Su", value: 0 },
  { label: "Mo", value: 1 },
  { label: "Tu", value: 2 },
  { label: "We", value: 3 },
  { label: "Th", value: 4 },
  { label: "Fr", value: 5 },
  { label: "Sa", value: 6 },
];

// ── Star rating ───────────────────────────────────────────────────────────────
function StarRating({ onRate }: { onRate: (r: number) => void }) {
  const [given, setGiven] = useState<number | null>(null);
  if (given !== null)
    return <Text style={s.feedbackThanks}>Thanks — this helps the engine learn ✦</Text>;
  return (
    <View style={s.starRow}>
      <Text style={s.starPrompt}>Was this helpful?</Text>
      <View style={{ flexDirection: "row", gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => { setGiven(n); onRate(n); }} hitSlop={4}>
            <Text style={s.star}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Entry card (collapsible for past entries) ─────────────────────────────────
function EntryCard({
  entry, index, onMarkRead, collapsible, defaultExpanded,
}: {
  entry: DevotionEntry;
  index: number;
  onMarkRead?: (id: string) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(!collapsible || defaultExpanded);

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, tension: 60, friction: 9, delay: index * 60, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      <View style={[s.card, !entry.is_read && s.cardUnread]}>
        {!entry.is_read && <View style={s.unreadStrip} />}
        <View style={{ flex: 1 }}>
          {/* Header — always visible; tap to expand when collapsible */}
          <TouchableOpacity
            activeOpacity={collapsible ? 0.75 : 1}
            onPress={collapsible ? () => setExpanded(e => !e) : undefined}
          >
            <View style={s.cardHeaderRow}>
              {entry.scripture_reference ? (
                <View style={s.scriptureTag}>
                  <Text style={s.scriptureTagText}>{entry.scripture_reference}</Text>
                </View>
              ) : null}
              {collapsible && (
                <Text style={s.collapseIcon}>{expanded ? '▲' : '▼'}</Text>
              )}
            </View>
            <Text style={s.cardTitle}>{entry.title}</Text>
            <Text style={s.cardDate}>
              {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </Text>
          </TouchableOpacity>

          {/* Expandable body */}
          {expanded && (
            <>
              {entry.scripture_text ? (
                <View style={s.scriptureQuote}>
                  <View style={s.quoteBar} />
                  <Text style={s.scriptureText}>{entry.scripture_text}</Text>
                </View>
              ) : null}
              <Text style={s.cardBody}>{entry.body}</Text>
              {entry.closing_prayer ? (
                <View style={s.prayerWrap}>
                  <Text style={s.prayerLabel}>CLOSING PRAYER</Text>
                  <Text style={s.prayerText}>{entry.closing_prayer}</Text>
                </View>
              ) : null}
              {entry.category ? (
                <StarRating
                  onRate={(rating) =>
                    submitGenerationFeedback({
                      entryType: "devotion", category: entry.category!,
                      verseRef: entry.scripture_reference ?? undefined,
                      rating, sourceText: entry.sourceText,
                    }).catch(() => {})
                  }
                />
              ) : null}
              <View style={s.cardFooter}>
                <View />
                {!entry.is_read && onMarkRead && (
                  <TouchableOpacity style={s.markReadBtn} onPress={() => onMarkRead(entry.id)} activeOpacity={0.75}>
                    <Text style={s.markReadText}>✓ Mark as read</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────
function SectionDivider({ label, count }: { label: string; count?: number }) {
  return (
    <View style={s.dividerRow}>
      <View style={s.dividerLine} />
      <View style={s.dividerLabelWrap}>
        <Text style={s.dividerLabel}>{label}</Text>
        {count != null && count > 0 && (
          <View style={s.dividerBadge}>
            <Text style={s.dividerBadgeText}>{count}</Text>
          </View>
        )}
      </View>
      <View style={s.dividerLine} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DevotionsScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // Form state
  const [goal, setGoal] = useState("");
  const [duration, setDuration] = useState<Duration>("daily");
  const [hour12, setHour12] = useState("6");
  const [minute, setMinute] = useState("30");
  const [amPm, setAmPm] = useState<"AM" | "PM">("AM");
  const [ringtone, setRingtone] = useState<"default" | "gentle" | "bell" | "silent">("default");
  const [daysCount, setDaysCount] = useState<number | null>(null);
  const [excludedDays, setExcludedDays] = useState<number[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Screen state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<DevotionEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [arrivedFromNotif, setArrivedFromNotif] = useState(false);
  const autoGenerateAttempted = useRef(false);

  const PAGE_SIZE = 20;

  async function loadEntries(replace = true, before?: string) {
    if (!replace && loadingMore) return;
    if (!replace) setLoadingMore(true);
    else setLoadingEntries(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let q = supabase
        .from("devotion_entries")
        .select("id, title, scripture_reference, scripture_text, body, closing_prayer, created_at, is_read")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (before) q = q.lt("created_at", before);
      const { data } = await q;
      const rows = data ?? [];
      if (replace) setEntries(rows);
      else setEntries(prev => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {}
    finally {
      if (!replace) setLoadingMore(false);
      else setLoadingEntries(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      autoGenerateAttempted.current = false;
      const alarm = consumePendingAlarm();
      if (alarm?.type === "devotion" && Date.now() - alarm.timestamp < 120_000) {
        setArrivedFromNotif(true);
        if (alarm.goal) {
          // Store the alarm goal for auto-generate if no unread entries exist
          setGoal(alarm.goal);
          if (alarm.duration) setDuration(alarm.duration as Duration);
        }
        setTimeout(() => scrollRef.current?.scrollTo({ y: 420, animated: true }), 600);
      } else {
        setArrivedFromNotif(false);
      }

      loadEntries(true);
      return () => { active = false; };
    }, [])
  );

  // Auto-generate when arriving from notification and no unread entries exist
  useEffect(() => {
    if (
      arrivedFromNotif &&
      !loadingEntries &&
      !busy &&
      !autoGenerateAttempted.current &&
      goal.trim() &&
      entries.filter(e => !e.is_read).length === 0
    ) {
      autoGenerateAttempted.current = true;
      handleGenerate();
    }
  }, [arrivedFromNotif, loadingEntries, entries.length]);

  async function markAsRead(entryId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, is_read: true } : e));
    await supabase.from("devotion_entries").update({ is_read: true }).eq("id", entryId).eq("user_id", user.id);
  }

  function toggleExcludeDay(dow: number) {
    setExcludedDays((prev) =>
      prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]
    );
  }

  async function handleGenerate() {
    setError(null);
    if (!goal.trim()) { setError("Describe your spiritual goal first."); return; }
    const h12 = parseInt(hour12, 10);
    const m = parseInt(minute, 10);
    if (isNaN(h12) || h12 < 1 || h12 > 12 || isNaN(m) || m < 0 || m > 59) {
      setError("Enter a valid time (1–12 for hour, 0–59 for minutes)."); return;
    }
    const h = amPm === "AM" ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: plan, error: planErr } = await supabase
        .from("devotion_plans")
        .insert({
          user_id: user.id,
          goal: goal.trim(),
          duration,
          preferred_time: `${h}:${m.toString().padStart(2, "0")}:00`,
          days_count: daysCount,
          excluded_days: excludedDays,
        })
        .select().single();
      if (planErr) throw planErr;

      const result = await generateDevotion({ goal: goal.trim(), duration });

      const { data: entry, error: entryErr } = await supabase
        .from("devotion_entries")
        .insert({
          plan_id: plan.id, user_id: user.id,
          title: result.title,
          scripture_reference: result.scriptureReference,
          scripture_text: result.scriptureText,
          body: result.body,
          closing_prayer: result.closingPrayer,
          is_read: false,          // starts unread — user must mark read
        })
        .select().single();
      if (entryErr) throw entryErr;

      const enriched: DevotionEntry = { ...entry, category: result.detectedCategory, sourceText: goal.trim() };
      setEntries((prev) => [enriched, ...prev]);

      await scheduleRecurringReminder({
        identifier: `devotion-${plan.id}`,
        title: "Time for your devotion 🌿",
        body: result.title,
        hour: h, minute: m, frequency: duration,
        sound: ringtone,
        data: { type: "devotion", goal: goal.trim() },
      });

      setGoal("");
      setExcludedDays([]);
      setDaysCount(null);
      // Scroll to the new unread entry
      setTimeout(() => scrollRef.current?.scrollTo({ y: 420, animated: true }), 300);
    } catch (e: any) {
      setError(e.message ?? "Couldn't generate your devotion. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore || entries.length === 0) return;
    const oldest = entries[entries.length - 1].created_at;
    await loadEntries(false, oldest);
  }

  const unread = entries.filter((e) => !e.is_read);
  const read   = entries.filter((e) => e.is_read);

  return (
    <ScrollView
      ref={scrollRef}
      style={s.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: spacing.xxxl + insets.bottom }}
    >
      {/* Header */}
      <LinearGradient
        colors={["#5B4010", "#8A6A10", "#C9A227", "#E2C060"]}
        locations={[0, 0.35, 0.7, 1]}
        style={[s.header, { paddingTop: spacing.lg + insets.top }]}
      >
        <Text style={s.headerEyebrow}>SPIRIT-GUIDED</Text>
        <Text style={s.headerTitle}>Daily Devotions</Text>
        <Text style={s.headerSub}>Scripture-rooted reflections for your spiritual journey</Text>
        {unread.length > 0 && (
          <View style={s.unreadPill}>
            <Text style={s.unreadPillText}>{unread.length} unread</Text>
          </View>
        )}
      </LinearGradient>

      {/* Arrival-from-notification banner */}
      {arrivedFromNotif && unread.length > 0 && (
        <View style={s.notifBanner}>
          <Text style={s.notifBannerIcon}>🌿</Text>
          <Text style={s.notifBannerText}>Your devotion is ready — scroll down to read it.</Text>
        </View>
      )}

      <View style={s.body}>
        {/* ── Form card ── */}
        <View style={s.formCard}>
          <Text style={s.formTitle}>New devotion plan</Text>

          <Text style={s.fieldLabel}>SPIRITUAL GOAL</Text>
          <TextInput
            style={s.textarea}
            placeholder="e.g. Growing in patience during trials, deepening my prayer life…"
            placeholderTextColor={colors.inkFaint}
            multiline
            value={goal}
            onChangeText={setGoal}
            textAlignVertical="top"
          />

          <Text style={s.fieldLabel}>FREQUENCY</Text>
          <View style={s.chipRow}>
            {DURATIONS.map((d) => (
              <Pressable key={d.id} style={[s.chip, duration === d.id && s.chipActive]} onPress={() => setDuration(d.id)}>
                <Text style={[s.chipIcon, duration === d.id && s.chipIconActive]}>{d.icon}</Text>
                <Text style={[s.chipText, duration === d.id && s.chipTextActive]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.fieldLabel}>REMINDER TIME</Text>
          <View style={s.timeRow}>
            <TextInput style={s.timeInput} value={hour12} onChangeText={(v) => setHour12(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} placeholder="6" placeholderTextColor={colors.inkFaint} />
            <Text style={s.timeSep}>:</Text>
            <TextInput style={s.timeInput} value={minute} onChangeText={(v) => setMinute(v.replace(/\D/g, ""))} keyboardType="number-pad" maxLength={2} placeholder="30" placeholderTextColor={colors.inkFaint} />
            <View style={s.amPmRow}>
              {(["AM", "PM"] as const).map((p) => (
                <Pressable key={p} style={[s.amPmBtn, amPm === p && s.amPmBtnActive]} onPress={() => setAmPm(p)}>
                  <Text style={[s.amPmText, amPm === p && s.amPmTextActive]}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Advanced toggle */}
          <Pressable style={s.advancedToggle} onPress={() => setShowAdvanced((v) => !v)}>
            <Text style={s.advancedToggleText}>{showAdvanced ? "▲ Hide options" : "▼ More options (days & schedule)"}</Text>
          </Pressable>

          {showAdvanced && (
            <>
              <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>HOW MANY DAYS</Text>
              <View style={s.chipRow}>
                {DAYS_OPTIONS.map((opt) => (
                  <Pressable
                    key={String(opt.value)}
                    style={[s.chip, daysCount === opt.value && s.chipActive]}
                    onPress={() => setDaysCount(opt.value)}
                  >
                    <Text style={[s.chipText, daysCount === opt.value && s.chipTextActive]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.fieldLabel}>SKIP THESE DAYS</Text>
              <View style={s.weekdayRow}>
                {WEEKDAYS.map((d) => {
                  const on = excludedDays.includes(d.value);
                  return (
                    <Pressable key={d.value} style={[s.weekdayBtn, on && s.weekdayBtnActive]} onPress={() => toggleExcludeDay(d.value)}>
                      <Text style={[s.weekdayText, on && s.weekdayTextActive]}>{d.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {excludedDays.length > 0 && (
                <Text style={s.excludeHint}>
                  Will skip: {excludedDays.sort((a, b) => a - b).map((d) => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")}
                </Text>
              )}

              <Text style={[s.fieldLabel, { marginTop: spacing.md }]}>RINGTONE</Text>
              <View style={s.chipRow}>
                {(["default", "gentle", "bell", "silent"] as const).map((r) => (
                  <Pressable key={r} style={[s.chip, ringtone === r && s.chipActive]} onPress={() => setRingtone(r)}>
                    <Text style={[s.chipText, ringtone === r && s.chipTextActive]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [s.generateBtn, pressed && s.generateBtnPressed, busy && { opacity: 0.7 }]}
            onPress={handleGenerate}
            disabled={busy}
          >
            <LinearGradient
              colors={busy ? [colors.inkFaint, colors.inkSoft] : ["#5B4010", "#C9A227"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.generateBtnGrad}
            >
              {busy ? (
                <><ActivityIndicator color={colors.parchment} size="small" /><Text style={s.generateBtnText}>Generating…</Text></>
              ) : (
                <Text style={s.generateBtnText}>Generate devotion ✦</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        {/* ── Entries ── */}
        {loadingEntries ? (
          <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {/* UNREAD — always expanded */}
            {unread.length > 0 && (
              <View style={s.historySection}>
                <SectionDivider label="UNREAD" count={unread.length} />
                {unread.map((e, i) => (
                  <EntryCard key={e.id} entry={e} index={i} onMarkRead={markAsRead} />
                ))}
              </View>
            )}

            {/* PAST DEVOTIONS — collapsible, first one expanded by default */}
            {read.length > 0 && (
              <View style={s.historySection}>
                <SectionDivider label="PAST DEVOTIONS" />
                {read.map((e, i) => (
                  <EntryCard
                    key={e.id} entry={e} index={i}
                    collapsible
                    defaultExpanded={i === 0}
                  />
                ))}
                {/* Load more */}
                {hasMore && (
                  <TouchableOpacity
                    style={s.loadMoreBtn}
                    onPress={loadMore}
                    disabled={loadingMore}
                    activeOpacity={0.75}
                  >
                    {loadingMore
                      ? <ActivityIndicator size="small" color={colors.olive} />
                      : <Text style={s.loadMoreText}>Load more devotions</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {entries.length === 0 && (
              <View style={s.emptyState}>
                <Text style={s.emptyIcon}>🌿</Text>
                <Text style={s.emptyTitle}>No devotions yet</Text>
                <Text style={s.emptyDesc}>Fill in your spiritual goal above and generate your first devotion.</Text>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 8 },
  headerEyebrow: { ...typography.micro, color: "rgba(255,255,255,0.55)", letterSpacing: 2, marginBottom: 4 },
  headerTitle: { fontSize: 26, fontWeight: "700", color: colors.white, letterSpacing: -0.4, marginBottom: 4 },
  headerSub: { ...typography.caption, color: "rgba(255,255,255,0.6)" },
  unreadPill: {
    marginTop: 10, alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radii.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  unreadPillText: { fontSize: 12, fontWeight: "700", color: colors.white },

  notifBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#EDF2E0", borderWidth: 1, borderColor: "#C2D4A0",
    margin: spacing.lg, marginBottom: 0,
    borderRadius: radii.md, padding: spacing.md,
  },
  notifBannerIcon: { fontSize: 20 },
  notifBannerText: { ...typography.bodySmall, color: colors.oliveDark, flex: 1, lineHeight: 20 },

  body: { padding: spacing.lg },

  formCard: { backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg, ...shadows.card, marginBottom: spacing.lg },
  formTitle: { ...typography.title, color: colors.oliveDark, marginBottom: spacing.lg },
  fieldLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: spacing.sm },
  textarea: {
    borderWidth: 1.5, borderColor: colors.parchmentDark, borderRadius: radii.md,
    padding: spacing.md, fontSize: 15, color: colors.ink, backgroundColor: colors.parchment,
    minHeight: 80, marginBottom: spacing.lg, lineHeight: 22,
  },
  chipRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg, flexWrap: "wrap" },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radii.pill, backgroundColor: colors.parchment,
    borderWidth: 1.5, borderColor: colors.parchmentDark,
  },
  chipActive: { backgroundColor: colors.oliveDark, borderColor: colors.oliveDark },
  chipIcon: { fontSize: 14, color: colors.inkSoft },
  chipIconActive: { color: colors.goldLight },
  chipText: { ...typography.caption, color: colors.inkSoft, textTransform: "capitalize" },
  chipTextActive: { color: colors.parchment, fontWeight: "700" },

  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  timeInput: {
    backgroundColor: colors.parchment, borderRadius: radii.sm,
    borderWidth: 1.5, borderColor: colors.parchmentDark,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    width: 52, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.ink,
  },
  timeSep: { fontSize: 22, fontWeight: "700", color: colors.ink },
  amPmRow: { flexDirection: "row", gap: 3, marginLeft: spacing.xs },
  amPmBtn: {
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    borderRadius: radii.sm, backgroundColor: colors.parchment,
    borderWidth: 1.5, borderColor: colors.parchmentDark,
  },
  amPmBtnActive: { backgroundColor: colors.olive, borderColor: colors.olive },
  amPmText: { fontSize: 12, fontWeight: "700", color: colors.inkSoft },
  amPmTextActive: { color: colors.white },

  advancedToggle: { alignSelf: "flex-start", marginBottom: spacing.sm },
  advancedToggleText: { fontSize: 13, color: colors.olive, fontWeight: "600" },

  weekdayRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm, flexWrap: "wrap" },
  weekdayBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.parchment, borderWidth: 1.5, borderColor: colors.parchmentDark,
  },
  weekdayBtnActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  weekdayText: { fontSize: 11, fontWeight: "700", color: colors.inkSoft },
  weekdayTextActive: { color: colors.white },
  excludeHint: { fontSize: 12, color: colors.danger, marginBottom: spacing.md },

  errorText: { color: colors.danger, fontSize: 14, marginBottom: spacing.sm, fontWeight: "500" },
  generateBtn: { borderRadius: radii.md, overflow: "hidden", ...shadows.card },
  generateBtnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  generateBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing.md + 2, gap: spacing.sm },
  generateBtnText: { color: colors.parchment, fontWeight: "700", fontSize: 16, letterSpacing: 0.2 },

  historySection: { marginBottom: spacing.xl },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.parchmentDark },
  dividerLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  dividerLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2 },
  dividerBadge: {
    backgroundColor: colors.gold, borderRadius: radii.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  dividerBadgeText: { fontSize: 10, fontWeight: "700", color: colors.white },

  card: {
    backgroundColor: colors.white, borderRadius: radii.lg,
    padding: spacing.md, marginBottom: spacing.md, ...shadows.subtle,
    flexDirection: "row",
  },
  cardUnread: { borderWidth: 1.5, borderColor: colors.gold + "60" },
  unreadStrip: {
    width: 4, borderRadius: 2, backgroundColor: colors.gold,
    marginRight: spacing.sm, alignSelf: "stretch",
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  collapseIcon: { fontSize: 11, color: colors.inkFaint, paddingLeft: 8 },
  scriptureTag: {
    alignSelf: "flex-start", backgroundColor: colors.terracotta,
    borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  scriptureTagText: { ...typography.micro, color: colors.white, letterSpacing: 0.5 },
  cardTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: 4 },
  scriptureQuote: {
    flexDirection: "row", gap: spacing.sm, backgroundColor: colors.parchment,
    borderRadius: radii.sm, padding: spacing.sm, marginBottom: spacing.sm,
  },
  quoteBar: { width: 3, borderRadius: 2, backgroundColor: colors.gold },
  scriptureText: { ...typography.bodySmall, color: colors.inkSoft, flex: 1, fontStyle: "italic", lineHeight: 20 },
  cardBody: { ...typography.bodySmall, color: colors.ink, lineHeight: 22 },
  prayerWrap: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.parchmentMid },
  prayerLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: 4 },
  prayerText: { ...typography.bodySmall, color: colors.inkSoft, fontStyle: "italic", lineHeight: 20 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  cardDate: { ...typography.micro, color: colors.inkFaint },
  markReadBtn: {
    backgroundColor: colors.olive + "15", borderWidth: 1, borderColor: colors.olive + "40",
    borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 5,
  },
  markReadText: { fontSize: 12, fontWeight: "700", color: colors.olive },

  starRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.parchmentMid },
  starPrompt: { ...typography.caption, color: colors.inkFaint },
  star: { fontSize: 16, color: colors.gold, marginLeft: 2 },
  feedbackThanks: { ...typography.caption, color: colors.olive, marginTop: spacing.sm, fontStyle: "italic" },

  loadMoreBtn: {
    alignItems: "center", paddingVertical: spacing.md,
    backgroundColor: colors.parchment, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.parchmentDark, marginTop: spacing.sm,
  },
  loadMoreText: { fontSize: 14, fontWeight: "600", color: colors.olive },

  emptyState: { alignItems: "center", paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  emptyDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: "center", lineHeight: 22 },
});
