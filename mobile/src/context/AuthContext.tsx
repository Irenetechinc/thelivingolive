import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Linking from "expo-linking";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getAuthRedirectUrl, completeSignInFromUrl } from "../lib/authLinking";
import { getExpoPushToken } from "../lib/notifications";
import { registerPushToken } from "../lib/api";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  pendingEmail: string | null;
  linkError: string | null;
  sendMagicLink: (email: string) => Promise<void>;
  resendMagicLink: () => Promise<void>;
  cancelPending: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function tryRegisterPush() {
  try {
    const token = await getExpoPushToken();
    if (token) {
      await registerPushToken(token, "expo");
    }
  } catch {
    // Non-fatal: local notifications still work
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const pendingEmailRef = useRef<string | null>(null);

  useEffect(() => {
    pendingEmailRef.current = pendingEmail;
  }, [pendingEmail]);

  // Bootstrap the session from persisted storage and keep it in sync.
  // Because persistSession/autoRefreshToken are on (see lib/supabase.ts),
  // a signed-in user stays signed in across app restarts on this device
  // without ever needing to re-verify their email.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session) tryRegisterPush();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        setPendingEmail(null);
        setLinkError(null);
      }
      if (newSession && _event === "SIGNED_IN") tryRegisterPush();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Supabase's RN guidance: only run the background refresh-token timer
  // while the app is foregrounded. This is what keeps the session alive
  // indefinitely on this device (new device = no stored session = must
  // request a new sign-in link).
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    return () => sub.remove();
  }, []);

  // Handle the sign-in link, whether the app was launched cold from it or
  // was already running in the background when the user tapped it.
  useEffect(() => {
    async function handle(url: string | null) {
      if (!url) return;
      const result = await completeSignInFromUrl(url);
      if (!result.handled) return;
      if (result.error) setLinkError(result.error);
    }

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      pendingEmail,
      linkError,
      sendMagicLink: async (email: string) => {
        setLinkError(null);
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: getAuthRedirectUrl(),
          },
        });
        if (error) throw error;
        setPendingEmail(email);
      },
      resendMagicLink: async () => {
        const email = pendingEmailRef.current;
        if (!email) return;
        setLinkError(null);
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: getAuthRedirectUrl(),
          },
        });
        if (error) throw error;
      },
      cancelPending: () => {
        setPendingEmail(null);
        setLinkError(null);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, pendingEmail, linkError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
