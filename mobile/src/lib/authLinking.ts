import * as Linking from "expo-linking";
import { supabase } from "./supabase";

/**
 * Builds the deep link Supabase should redirect to once the user taps the
 * sign-in link in their email. `Linking.createURL` automatically resolves
 * to the right scheme for whatever runtime the app is in:
 *   - Expo Go (dev):            exp://<host>:<port>/--/auth-callback
 *   - Dev client / standalone:  livingolive://auth-callback
 *
 * Whatever this resolves to at request time MUST be present in Supabase's
 * Authentication > URL Configuration > Redirect URLs allow list, or the
 * verification link will fail with "requested path is invalid".
 */
export function getAuthRedirectUrl() {
  return Linking.createURL("auth-callback");
}

export type AuthLinkResult = { handled: boolean; error?: string };

/**
 * Parses an incoming deep link produced by a Supabase magic-link email and
 * completes sign-in by exchanging it for a real session. Returns
 * `handled: false` for any URL that isn't an auth callback (e.g. the app
 * being opened normally) so callers can ignore it.
 */
export async function completeSignInFromUrl(url: string): Promise<AuthLinkResult> {
  const parsed = Linking.parse(url);
  const params = parsed.queryParams ?? {};

  const errorDescription = (params.error_description ?? params.error) as string | undefined;
  if (errorDescription) {
    return { handled: true, error: String(errorDescription).replace(/\+/g, " ") };
  }

  // PKCE flow (default for supabase-js v2 magic links): the link redirects
  // back to the app with ?code=... which is exchanged for a session.
  const code = params.code as string | undefined;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { handled: true, error: error.message };
    return { handled: true };
  }

  // Fallback: a token_hash style link (covers custom email templates that
  // link straight into the app instead of Supabase's hosted verify page).
  const tokenHash = (params.token_hash as string | undefined) ?? (params.token as string | undefined);
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (error) return { handled: true, error: error.message };
    return { handled: true };
  }

  return { handled: false };
}
