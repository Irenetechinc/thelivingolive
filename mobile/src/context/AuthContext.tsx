import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getExpoPushToken } from "../lib/notifications";
import { registerPushToken } from "../lib/api";

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  pendingEmail: string | null;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      // Register push token for already-logged-in users on app open
      if (data.session) tryRegisterPush();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Register push token on new sign-in
      if (newSession && _event === "SIGNED_IN") tryRegisterPush();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      pendingEmail,
      requestOtp: async (email: string) => {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: true },
        });
        if (error) throw error;
        setPendingEmail(email);
      },
      verifyOtp: async (email: string, token: string) => {
        const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
        if (error) throw error;
        setPendingEmail(null);
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, loading, pendingEmail]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
