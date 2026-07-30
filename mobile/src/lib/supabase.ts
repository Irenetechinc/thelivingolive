import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import type { SupportedStorage } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "The app was built without these env vars — rebuild with them configured in eas.json."
  );
}

// ── Secure storage adapter ────────────────────────────────────────────────────
// expo-secure-store uses the device keychain (iOS Keychain / Android Keystore),
// which is encrypted at rest and inaccessible to other apps even on rooted
// devices — far stronger than plain AsyncStorage.
//
// iOS SecureStore has a 2 KB per-value limit, but Supabase session objects can
// be 2–4 KB. We handle this by chunking values that exceed the safe threshold
// so the limit is never hit in practice.
const CHUNK_SIZE = 1800; // safely below the 2048-byte iOS SecureStore limit

const SecureStoreAdapter: SupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      // Try direct (covers the common case: value fits in one slot)
      const direct = await SecureStore.getItemAsync(key);
      if (direct !== null) return direct;

      // Try reassembled chunks (written by setItem for large values)
      const countStr = await SecureStore.getItemAsync(`${key}__n`);
      if (!countStr) return null;
      const count = parseInt(countStr, 10);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}__${i}`);
        if (chunk === null) return null; // incomplete — treat as missing
        parts.push(chunk);
      }
      return parts.join("");
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        // Clean up stale chunks from a previous large write, then store directly
        const oldCount = await SecureStore.getItemAsync(`${key}__n`).catch(() => null);
        if (oldCount) {
          const n = parseInt(oldCount, 10);
          for (let i = 0; i < n; i++) {
            await SecureStore.deleteItemAsync(`${key}__${i}`).catch(() => {});
          }
          await SecureStore.deleteItemAsync(`${key}__n`).catch(() => {});
        }
        await SecureStore.setItemAsync(key, value);
      } else {
        // Value exceeds single-slot limit — write chunks, remove any direct slot
        await SecureStore.deleteItemAsync(key).catch(() => {});
        const chunks: string[] = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          chunks.push(value.slice(i, i + CHUNK_SIZE));
        }
        for (let i = 0; i < chunks.length; i++) {
          await SecureStore.setItemAsync(`${key}__${i}`, chunks[i]);
        }
        await SecureStore.setItemAsync(`${key}__n`, String(chunks.length));
      }
    } catch (e) {
      // SecureStore unavailable (e.g. some Android emulators without a keystore)
      console.warn("[supabase] SecureStore write failed:", (e as any)?.message);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key).catch(() => {});
      const countStr = await SecureStore.getItemAsync(`${key}__n`).catch(() => null);
      if (countStr) {
        const n = parseInt(countStr, 10);
        for (let i = 0; i < n; i++) {
          await SecureStore.deleteItemAsync(`${key}__${i}`).catch(() => {});
        }
        await SecureStore.deleteItemAsync(`${key}__n`).catch(() => {});
      }
    } catch {}
  },
};

// Guard: if env vars are missing at build time, return a stub whose every
// method throws a clear, human-readable error instead of silently hitting
// "placeholder.supabase.co" and showing a cryptic network error.
function buildClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    const missingError = new Error(
      "Supabase is not configured: EXPO_PUBLIC_SUPABASE_URL and " +
        "EXPO_PUBLIC_SUPABASE_ANON_KEY must be set at build time. " +
        "Contact the app developer."
    );
    // Return a proxy that throws on any property access so the error
    // surfaces immediately at the call-site, not as a network failure.
    return new Proxy({} as ReturnType<typeof createClient>, {
      get(_target, prop) {
        // Allow symbol/toString checks used by React DevTools etc.
        if (typeof prop === "symbol" || prop === "toString" || prop === "then") {
          return undefined;
        }
        return () => {
          throw missingError;
        };
      },
    });
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // PKCE is required for the magic-link deep-link flow used on native:
      // the email link redirects back with `?code=...`, which the app
      // exchanges for a session via exchangeCodeForSession (see
      // src/lib/authLinking.ts).
      flowType: "pkce",
    },
  });
}

export const supabase = buildClient();
export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);
