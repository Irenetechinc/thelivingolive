import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
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

/**
 * Get the Expo push token for this device.
 * Returns null if on a simulator, or if permissions are denied.
 * Requires a real EAS project for production push delivery;
 * works with Expo Go for development.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push notifications only work on real devices
    return null;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  // Android requires a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#5B7553",
    });
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    return tokenData.data;
  } catch (err) {
    // Non-fatal: local notifications will still work
    console.warn("Could not get Expo push token:", err);
    return null;
  }
}

/**
 * Schedules a repeating local notification at a given hour/minute.
 * Local notifications are reliable in Expo Go (no EAS needed).
 * Server-driven push supplements these for background/killed-app delivery.
 */
export async function scheduleRecurringReminder(params: {
  identifier: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  weekday?: number; // 1 (Sun) – 7 (Sat), used for weekly
}) {
  const granted = await ensureNotificationPermission();
  if (!granted) throw new Error("Notification permission was not granted.");

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
    // Expo has no native monthly/yearly repeating trigger; approximate with
    // a date-based trigger (re-scheduled on next app open via DevotionsScreen).
    const next = new Date();
    next.setHours(params.hour, params.minute, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    if (params.frequency === "monthly") next.setMonth(next.getMonth() + 1);
    if (params.frequency === "yearly") next.setFullYear(next.getFullYear() + 1);

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
