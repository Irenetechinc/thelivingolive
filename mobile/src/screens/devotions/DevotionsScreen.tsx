import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { generateDevotion } from "../../lib/api";
import { scheduleRecurringReminder } from "../../lib/notifications";
import { colors, radii, spacing, typography } from "../../theme/theme";

type Duration = "daily" | "weekly" | "monthly" | "yearly";
const durations: Duration[] = ["daily", "weekly", "monthly", "yearly"];

type DevotionEntry = {
  id: string;
  title: string;
  scripture_reference: string | null;
  scripture_text: string | null;
  body: string;
  closing_prayer: string | null;
  created_at: string;
};

export default function DevotionsScreen() {
  const [goal, setGoal] = useState("");
  const [duration, setDuration] = useState<Duration>("daily");
  const [hour, setHour] = useState("6");
  const [minute, setMinute] = useState("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<DevotionEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
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
      return () => {
        active = false;
      };
    }, [])
  );

  async function handleGenerate() {
    setError(null);
    if (!goal.trim()) {
      setError("Describe your spiritual goal first.");
      return;
    }
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    if (Number.isNaN(h) || h < 0 || h > 23 || Number.isNaN(m) || m < 0 || m > 59) {
      setError("Enter a valid time (hour 0-23, minute 0-59).");
      return;
    }

    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      const { data: plan, error: planError } = await supabase
        .from("devotion_plans")
        .insert({ user_id: userData.user.id, goal: goal.trim(), duration, preferred_time: `${hour}:${minute}:00` })
        .select()
        .single();
      if (planError) throw planError;

      const result = await generateDevotion({ goal: goal.trim(), duration });

      const { data: entry, error: entryError } = await supabase
        .from("devotion_entries")
        .insert({
          plan_id: plan.id,
          user_id: userData.user.id,
          title: result.title,
          scripture_reference: result.scriptureReference,
          scripture_text: result.scriptureText,
          body: result.body,
          closing_prayer: result.closingPrayer,
        })
        .select()
        .single();
      if (entryError) throw entryError;

      setEntries((prev) => [entry, ...prev]);

      await scheduleRecurringReminder({
        identifier: `devotion-${plan.id}`,
        title: "Time for your devotion 🌿",
        body: result.title,
        hour: h,
        minute: m,
        frequency: duration,
      });

      setGoal("");
    } catch (e: any) {
      setError(e.message ?? "Couldn't generate your devotion. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.sectionTitle}>New devotion plan</Text>
      <TextInput
        style={styles.input}
        placeholder="Your spiritual goal (e.g. growing in patience)"
        placeholderTextColor={colors.inkSoft}
        value={goal}
        onChangeText={setGoal}
        multiline
      />

      <View style={styles.row}>
        {durations.map((d) => (
          <Pressable
            key={d}
            style={[styles.chip, duration === d && styles.chipActive]}
            onPress={() => setDuration(d)}
          >
            <Text style={[styles.chipText, duration === d && styles.chipTextActive]}>{d}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.label}>Preferred time</Text>
        <TextInput style={styles.timeInput} keyboardType="number-pad" value={hour} onChangeText={setHour} maxLength={2} />
        <Text style={styles.timeSeparator}>:</Text>
        <TextInput style={styles.timeInput} keyboardType="number-pad" value={minute} onChangeText={setMinute} maxLength={2} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.primaryButton} onPress={handleGenerate} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Generate devotion</Text>}
      </Pressable>

      <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Your devotions</Text>
      {loadingEntries && <ActivityIndicator color={colors.olive} />}
      {entries.map((entry) => (
        <View key={entry.id} style={styles.card}>
          <Text style={styles.cardTitle}>{entry.title}</Text>
          {entry.scripture_reference && (
            <Text style={styles.scriptureRef}>
              {entry.scripture_reference}
              {entry.scripture_text ? ` — "${entry.scripture_text}"` : ""}
            </Text>
          )}
          <Text style={styles.cardBody}>{entry.body}</Text>
          {entry.closing_prayer && <Text style={styles.closingPrayer}>{entry.closing_prayer}</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  sectionTitle: { ...typography.title, color: colors.oliveDark, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    marginBottom: spacing.md,
    minHeight: 60,
    color: colors.ink,
  },
  row: { flexDirection: "row", flexWrap: "wrap", marginBottom: spacing.md },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipActive: { backgroundColor: colors.olive, borderColor: colors.olive },
  chipText: { color: colors.ink, textTransform: "capitalize" },
  chipTextActive: { color: colors.white, fontWeight: "700" },
  timeRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  label: { ...typography.body, color: colors.ink, marginRight: spacing.md },
  timeInput: {
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.parchmentDark,
    padding: spacing.sm,
    width: 48,
    textAlign: "center",
    color: colors.ink,
  },
  timeSeparator: { marginHorizontal: spacing.xs, color: colors.ink, fontWeight: "700" },
  primaryButton: {
    backgroundColor: colors.olive,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryButtonText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  error: { color: colors.danger, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.subtitle, color: colors.oliveDark, marginBottom: spacing.xs },
  scriptureRef: { ...typography.caption, color: colors.terracotta, marginBottom: spacing.sm, fontStyle: "italic" },
  cardBody: { ...typography.body, color: colors.ink },
  closingPrayer: { ...typography.body, color: colors.inkSoft, marginTop: spacing.sm, fontStyle: "italic" },
});
