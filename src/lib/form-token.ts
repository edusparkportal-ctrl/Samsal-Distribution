/**
 * Signed form-start token (anti-bot timing check).
 *
 * The old design trusted a timestamp sent by the browser, which a bot can simply
 * forge. Now the SERVER issues the timestamp (GET /api/quote/token) signed with an
 * HMAC secret, and verifies the signature and age on submit. A bot cannot create a
 * valid "old" token, so it must wait at least MIN_FILL_MS after fetching one.
 *
 * Set FORM_TOKEN_SECRET (any long random string, e.g. `openssl rand -hex 32`) in
 * Vercel. If it is missing in production, the token check is skipped and a warning
 * is logged; the other protections (honeypot, rate limit, Turnstile) still apply.
 */
import { createHmac, timingSafeEqual } from "crypto";

export const MIN_FILL_MS = 3000;
export const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours to complete a form

const secret = () => process.env.FORM_TOKEN_SECRET || "";

const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("hex");

export function tokenEnabled() {
  return secret().length >= 16;
}

export function issueToken(now = Date.now()): string {
  const key = secret();
  const nonce = Math.random().toString(36).slice(2, 10);
  const payload = `${now}.${nonce}`;
  return `${payload}.${sign(payload, key)}`;
}

export type TokenCheck = "ok" | "missing" | "invalid" | "too_fast" | "expired" | "skipped";

export function verifyToken(token: string, now = Date.now()): TokenCheck {
  const key = secret();
  if (key.length < 16) return "skipped";
  if (!token) return "missing";
  const parts = token.split(".");
  if (parts.length !== 3) return "invalid";
  const [ts, nonce, sig] = parts;
  const expected = sign(`${ts}.${nonce}`, key);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "invalid";
  const age = now - Number(ts);
  if (!Number.isFinite(age) || age < 0) return "invalid";
  if (age < MIN_FILL_MS) return "too_fast";
  if (age > MAX_AGE_MS) return "expired";
  return "ok";
}
