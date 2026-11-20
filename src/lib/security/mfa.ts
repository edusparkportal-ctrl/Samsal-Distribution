/**
 * Pure helpers for reading the assurance level of a Supabase session (no network, unit tested).
 * The access token is signed by Supabase and was already validated by auth.getUser(); we only read claims from it.
 */
export type SessionAssurance = { aal: "aal1" | "aal2"; lastTotpAt: number | null };

/** Maximum age of the last second-factor check for sensitive actions (matches mfa_ok(900) in the database). */
export const STEP_UP_MAX_AGE_SECONDS = 900;

export function decodeJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = typeof Buffer !== "undefined" ? Buffer.from(b64, "base64").toString("utf8") : atob(b64);
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function assuranceFromClaims(claims: Record<string, unknown> | null): SessionAssurance {
  const aal = claims?.aal === "aal2" ? "aal2" : "aal1";
  const amr = Array.isArray(claims?.amr) ? (claims!.amr as unknown[]) : [];
  let last: number | null = null;
  for (const a of amr) {
    if (a && typeof a === "object" && (a as { method?: unknown }).method === "totp") {
      const t = Number((a as { timestamp?: unknown }).timestamp);
      if (Number.isFinite(t) && (last === null || t > last)) last = t;
    }
  }
  return { aal, lastTotpAt: last };
}

export function isRecentMfa(a: SessionAssurance, maxAgeSeconds = STEP_UP_MAX_AGE_SECONDS, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return a.aal === "aal2" && a.lastTotpAt !== null && a.lastTotpAt >= nowSeconds - maxAgeSeconds;
}

export const TOTP_CODE_RE = /^\d{6}$/;

/** Marker the database puts at the start of its "needs a fresh authenticator code" messages. */
export const MFA_MARKER = "[mfa]";
export const needsMfaMessage = (msg: string | null | undefined) => (msg ?? "").includes(MFA_MARKER);
