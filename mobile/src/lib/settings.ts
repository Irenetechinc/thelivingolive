import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// Lightweight app-wide settings persistence. Small, ad-hoc preferences live
// here rather than pulling in a full settings screen/context.

const HYMN_AUTO_HIGHLIGHT_KEY = "settings:hymnAutoHighlight";
const PRAYER_REMINDER_ENABLED_KEY = "settings:prayerReminderEnabled";
const DEVOTION_REMINDER_ENABLED_KEY = "settings:devotionReminderEnabled";
const PRAYER_QUIET_START_KEY = "settings:prayerQuietStart";
const PRAYER_QUIET_END_KEY = "settings:prayerQuietEnd";
const DEVOTION_QUIET_START_KEY = "settings:devotionQuietStart";
const DEVOTION_QUIET_END_KEY = "settings:devotionQuietEnd";

// On by default per product requirement — sing-along highlighting should
// work out of the box, with an explicit opt-out rather than opt-in.
const HYMN_AUTO_HIGHLIGHT_DEFAULT = true;
const REMINDER_DEFAULT = true;
const QUIET_DEFAULT_START = "22:00";
const QUIET_DEFAULT_END = "06:00";

type ReminderType = "prayer" | "devotion";

export async function getHymnAutoHighlightPref(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(HYMN_AUTO_HIGHLIGHT_KEY);
  if (raw === null) return HYMN_AUTO_HIGHLIGHT_DEFAULT;
  return raw === "true";
}

export async function setHymnAutoHighlightPref(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(HYMN_AUTO_HIGHLIGHT_KEY, enabled ? "true" : "false");
}

export async function getReminderEnabled(type: ReminderType, fallback = REMINDER_DEFAULT): Promise<boolean> {
  const key = type === "prayer" ? PRAYER_REMINDER_ENABLED_KEY : DEVOTION_REMINDER_ENABLED_KEY;
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

export async function setReminderEnabled(type: ReminderType, enabled: boolean): Promise<void> {
  const key = type === "prayer" ? PRAYER_REMINDER_ENABLED_KEY : DEVOTION_REMINDER_ENABLED_KEY;
  await AsyncStorage.setItem(key, enabled ? "true" : "false");

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      prayer_reminders_enabled: type === "prayer" ? enabled : undefined,
      devotion_reminders_enabled: type === "devotion" ? enabled : undefined,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("user_reminder_settings").upsert(payload, { onConflict: "user_id" });
  } catch {
    // Non-fatal: local storage already handled it.
  }
}

export async function getReminderQuietWindow(type: ReminderType): Promise<{ start: string; end: string }> {
  const startKey = type === "prayer" ? PRAYER_QUIET_START_KEY : DEVOTION_QUIET_START_KEY;
  const endKey = type === "prayer" ? PRAYER_QUIET_END_KEY : DEVOTION_QUIET_END_KEY;
  const [startRaw, endRaw] = await Promise.all([AsyncStorage.getItem(startKey), AsyncStorage.getItem(endKey)]);
  return {
    start: startRaw ?? QUIET_DEFAULT_START,
    end: endRaw ?? QUIET_DEFAULT_END,
  };
}

export async function setReminderQuietWindow(type: ReminderType, start: string, end: string): Promise<void> {
  const startKey = type === "prayer" ? PRAYER_QUIET_START_KEY : DEVOTION_QUIET_START_KEY;
  const endKey = type === "prayer" ? PRAYER_QUIET_END_KEY : DEVOTION_QUIET_END_KEY;
  await Promise.all([
    AsyncStorage.setItem(startKey, start),
    AsyncStorage.setItem(endKey, end),
  ]);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      prayer_quiet_start: type === "prayer" ? start : undefined,
      prayer_quiet_end: type === "prayer" ? end : undefined,
      devotion_quiet_start: type === "devotion" ? start : undefined,
      devotion_quiet_end: type === "devotion" ? end : undefined,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("user_reminder_settings").upsert(payload, { onConflict: "user_id" });
  } catch {
    // Non-fatal: local storage already handled it.
  }
}

export async function loadReminderSettings(type: ReminderType): Promise<{ enabled: boolean; quietStart: string; quietEnd: string }> {
  const [enabled, quiet] = await Promise.all([
    getReminderEnabled(type),
    getReminderQuietWindow(type),
  ]);
  return { enabled, quietStart: quiet.start, quietEnd: quiet.end };
}

export async function saveReminderSettings(
  type: ReminderType,
  settings: { enabled?: boolean; quietStart?: string; quietEnd?: string }
): Promise<void> {
  const current = await loadReminderSettings(type);
  const enabled = settings.enabled ?? current.enabled;
  const quietStart = settings.quietStart ?? current.quietStart;
  const quietEnd = settings.quietEnd ?? current.quietEnd;

  await setReminderEnabled(type, enabled);
  await setReminderQuietWindow(type, quietStart, quietEnd);
}

export function isWithinQuietHours(hour: number, minute: number, start: string, end: string): boolean {
  const toMinutes = (time: string) => {
    if (!time || !time.includes(":")) return 0;
    const [h, m] = time.split(":").map(part => Number(part));
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  };

  const current = hour * 60 + minute;
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return current >= startMinutes && current < endMinutes;
  }
  return current >= startMinutes || current < endMinutes;
}
