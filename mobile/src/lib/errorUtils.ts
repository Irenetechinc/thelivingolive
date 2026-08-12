/**
 * errorUtils.ts — User-facing error sanitization helpers.
 *
 * NEVER show raw error messages to users. DB errors, stack traces, server
 * hostnames, and env-var names are all internal details that must stay on
 * the server or in device logs. This helper maps any thrown error to a safe,
 * human-readable string before it reaches any UI component.
 */

const INTERNAL_PATTERNS = [
  /at \w/,                          // stack trace frames: "at Object.", "at async"
  /Error:/,                          // chained JS error prefix
  /\n/,                              // multi-line == stack trace
  /supabase/i,
  /railway/i,
  /postgresql/i,
  /relation "/i,                     // DB "relation X does not exist"
  /column "/i,                       // DB column errors
  /duplicate key/i,
  /violates/i,                       // DB constraint violation
  /environment variable/i,
  /SUPABASE/,
  /RAILWAY/,
  /replit/i,
  /localhost/i,
  /\.replit\.dev/,
  /\d{1,3}\.\d{1,3}\.\d{1,3}/,      // IP address
  /ECONNREFUSED/,
  /ENOTFOUND/,
  /ETIMEDOUT/,
];

/**
 * Converts any thrown value to a user-safe string.
 *
 * Messages that look like clean API validation responses (short, no internal
 * patterns) pass through unchanged. Everything else is replaced with `fallback`.
 */
export function friendlyError(
  e: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const msg = (
    (e as any)?.message ??
    (typeof e === "string" ? e : "") ??
    ""
  ).trim();

  if (!msg) return fallback;

  // Network / timeout errors → specific friendly messages
  const name = (e as any)?.name ?? "";
  if (name === "TimeoutError" || name === "AbortError" || msg.includes("timed out")) {
    return "Request timed out. Check your connection and try again.";
  }
  if (
    msg.includes("Network request failed") ||
    msg.toLowerCase().includes("network error") ||
    name === "NetworkError"
  ) {
    return "Network error. Check your connection and try again.";
  }

  // Long messages are never user-facing
  if (msg.length > 200) return fallback;

  // Check for internal patterns
  if (INTERNAL_PATTERNS.some((re) => re.test(msg))) return fallback;

  // Short, clean message — safe to show (e.g. API validation errors)
  return msg;
}
