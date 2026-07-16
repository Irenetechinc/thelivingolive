import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "The app was built without these env vars — rebuild with them configured in eas.json."
  );
}

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
