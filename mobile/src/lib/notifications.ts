import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// Schedules a repeating local notification at a given hour/minute.
// `frequency` maps the user's chosen devotion/prayer cadence onto a trigger.
export async function scheduleRecurringReminder(params: {
  identifier: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  weekday?: number; // 1 (Sun) - 7 (Sat), used for weekly
}) {
  const granted = await ensureNotificationPermission();
  if (!granted) {
    throw new Error("Notification permission was not granted.");
  }

  await Notifications.cancelScheduledNotificationAsync(params.identifier).catch(() => {});

  const base = {
    identifier: params.identifier,
    content: { title: params.title, body: params.body, sound: true },
  };

  if (params.frequency === "daily") {
    await Notifications.scheduleNotificationAsync({
      ...base,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: params.hour,
        minute: params.minute,
      },
    });
  } else if (params.frequency === "weekly") {
    await Notifications.scheduleNotificationAsync({
      ...base,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: params.weekday ?? 1,
        hour: params.hour,
        minute: params.minute,
      },
    });
  } else {
    // Expo has no native monthly/yearly recurring trigger; approximate with a
    // date-based trigger that this screen re-schedules each time it fires,
    // via the app re-registering on next launch/visit.
    const next = new Date();
    next.setHours(params.hour, params.minute, 0, 0);
    if (next.getTime() < Date.now()) {
      next.setDate(next.getDate() + 1);
    }
    if (params.frequency === "monthly") next.setMonth(next.getMonth() + (next < new Date() ? 1 : 0));
    if (params.frequency === "yearly") next.setFullYear(next.getFullYear() + (next < new Date() ? 1 : 0));

    await Notifications.scheduleNotificationAsync({
      ...base,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: next },
    });
  }
}

export async function cancelReminder(identifier: string) {
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}

export const isPhysicalDeviceHint =
  Platform.OS === "ios" || Platform.OS === "android"
    ? "Push scheduling requires a physical device — notifications are unreliable in simulators."
    : null;
