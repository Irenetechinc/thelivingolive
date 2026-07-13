import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "Supabase features will not work until the app is rebuilt with these env vars."
  );
}

// Guard: createClient throws on empty/invalid URL. Return a dummy that
// surfaces a clear error rather than crashing the whole app.
function buildClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a minimal stub so the rest of the app can import `supabase`
    // without crashing; auth calls will fail gracefully with a thrown error.
    return createClient(
      "https://placeholder.supabase.co",
      "placeholder-anon-key",
      {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
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
