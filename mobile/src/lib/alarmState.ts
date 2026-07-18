// Simple module-level store for pending alarm triggers.
// When a scheduled notification is tapped, AppNavigator writes here
// before navigating to the relevant screen. The screen reads + clears it
// on focus to decide whether to pre-fill form fields and show an alarm banner.

export type AlarmTrigger = {
  type: "devotion" | "prayer";
  goal?: string;
  desires?: string;
  prayerType?: string;
  /** Supabase entry ID of the pre-generated content (set by server cron push) */
  entryId?: string;
  /** Short preview text shown in the alarm screen */
  previewText?: string;
  timestamp: number; // ms — used to ignore stale triggers (> 30s old)
};

let _pending: AlarmTrigger | null = null;

export function setPendingAlarm(trigger: AlarmTrigger): void {
  _pending = trigger;
}

/** Read and clear the pending alarm. Returns null if nothing is pending. */
export function consumePendingAlarm(): AlarmTrigger | null {
  const v = _pending;
  _pending = null;
  return v;
}
