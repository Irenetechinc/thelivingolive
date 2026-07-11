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
import { generatePrayer } from "../../lib/api";
import { scheduleRecurringReminder } from "../../lib/notifications";
import { colors, radii, spacing, typography } from "../../theme/theme";

const prayerTypes = ["Warfare", "Adoration", "Intercession", "Thanksgiving", "Petition"];

type PrayerEntry = {
  id: string;
  title: string;
  prayer_text: string;
  scripture_reference: string | null;
  created_at: string;
};

export default function PrayerScreen() {
  const [desires, setDesires] = useState("");
  const [count, setCount] = useState("3");
  const [type, setType] = useState(prayerTypes[0]);
  const [hour, setHour] = useState("6");
  const [minute, setMinute] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<PrayerEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoadingEntries(true);
        const { data } = await supabase
          .from("prayer_entries")
          .select("id, title, prayer_text, scripture_reference, created_at")
          .order("created_at", { ascending: false })
          .limit(30);
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
    if (!desires.trim()) {
      setError("Share the desire of your heart first.");
      return;
    }
    const n = parseInt(count, 10);
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    if (Number.isNaN(n) || n < 1 || n > 10) {
      setError("Prayer point count must be between 1 and 10.");
      return;
    }
    if (Number.isNaN(h) || h < 0 || h > 23 || Number.isNaN(m) || m < 0 || m > 59) {
      setError("Enter a valid time (hour 0-23, minute 0-59).");
      return;
    }

    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      const { data: plan, error: planError } = await supabase
        .from("prayer_plans")
        .insert({
          user_id: userData.user.id,
          desires: desires.trim(),
          prayer_type: type,
          point_count: n,
          preferred_time: `${hour}:${minute}:00`,
        })
        .select()
        .single();
      if (planError) throw planError;

      const result = await generatePrayer({ desires: desires.trim(), count: n, type });

      const rows = result.prayerPoints.map((p) => ({
        plan_id: plan.id,
        user_id: userData.user!.id,
        title: p.title,
        prayer_text: p.prayerText,
        scripture_reference: p.scriptureReference,
      }));
      const { data: inserted, error: insertError } = await supabase.from("prayer_entries").insert(rows).select();
      if (insertError) throw insertError;

      setEntries((prev) => [...(inserted ?? []), ...prev]);

      await scheduleRecurringReminder({
        identifier: `prayer-${plan.id}`,
        title: "Time to pray 🙏",
        body: `${type} prayer points are ready`,
        hour: h,
        minute: m,
        frequency: "daily",
      });

      setDesires("");
    } catch (e: any) {
      setError(e.message ?? "Couldn't generate prayers. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.sectionTitle}>New prayer points</Text>
      <TextInput
        style={styles.input}
        placeholder="The desire of your heart..."
        placeholderTextColor={colors.inkSoft}
        value={desires}
        onChangeText={setDesires}
        multiline
      />

      <View style={styles.row}>
        {prayerTypes.map((t) => (
          <Pressable key={t} style={[styles.chip, type === t && styles.chipActive]} onPress={() => setType(t)}>
            <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.label}>How many points</Text>
        <TextInput style={styles.timeInput} keyboardType="number-pad" value={count} onChangeText={setCount} maxLength={2} />
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.label}>Preferred time</Text>
        <TextInput style={styles.timeInput} keyboardType="number-pad" value={hour} onChangeText={setHour} maxLength={2} />
        <Text style={styles.timeSeparator}>:</Text>
        <TextInput style={styles.timeInput} keyboardType="number-pad" value={minute} onChangeText={setMinute} maxLength={2} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.primaryButton} onPress={handleGenerate} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Generate prayers</Text>}
      </Pressable>

      <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Your prayer points</Text>
      {loadingEntries && <ActivityIndicator color={colors.olive} />}
      {entries.map((entry) => (
        <View key={entry.id} style={styles.card}>
          <Text style={styles.cardTitle}>{entry.title}</Text>
          <Text style={styles.cardBody}>{entry.prayer_text}</Text>
          {entry.scripture_reference && <Text style={styles.scriptureRef}>{entry.scripture_reference}</Text>}
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
  chipActive: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  chipText: { color: colors.ink },
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
    backgroundColor: colors.terracotta,
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
  cardBody: { ...typography.body, color: colors.ink },
  scriptureRef: { ...typography.caption, color: colors.terracotta, marginTop: spacing.sm, fontStyle: "italic" },
});
