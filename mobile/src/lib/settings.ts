import AsyncStorage from "@react-native-async-storage/async-storage";

// Lightweight app-wide settings persistence. Small, ad-hoc preferences live
// here rather than pulling in a full settings screen/context.

const HYMN_AUTO_HIGHLIGHT_KEY = "settings:hymnAutoHighlight";

// On by default per product requirement — sing-along highlighting should
// work out of the box, with an explicit opt-out rather than opt-in.
const HYMN_AUTO_HIGHLIGHT_DEFAULT = true;

export async function getHymnAutoHighlightPref(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(HYMN_AUTO_HIGHLIGHT_KEY);
  if (raw === null) return HYMN_AUTO_HIGHLIGHT_DEFAULT;
  return raw === "true";
}

export async function setHymnAutoHighlightPref(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(HYMN_AUTO_HIGHLIGHT_KEY, enabled ? "true" : "false");
}
