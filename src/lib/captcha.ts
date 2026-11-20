/**
 * Cloudflare Turnstile verification.
 *
 * FAIL CLOSED: in production the check is mandatory. A missing secret, a missing token, an unreachable
 * Cloudflare or a "not successful" answer all REFUSE the submission. Only outside production (local
 * development) is the check skipped when no secret is configured.
 */
export type CaptchaResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: "unconfigured" | "missing_token" | "rejected" | "unavailable" };

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string, ip: string, fetchImpl: typeof fetch = fetch): Promise<CaptchaResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return process.env.NODE_ENV === "production" ? { ok: false, reason: "unconfigured" } : { ok: true, skipped: true };
  if (!token || token.length > 2048) return { ok: false, reason: "missing_token" };
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: "rejected" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
