/**
 * Signed form-start token (anti-bot timing check).
 *
 * The SERVER issues the timestamp (GET /api/quote/token) signed with an HMAC secret, and verifies the
 * signature and age on submit. A bot cannot create a valid "old" token, so it must wait at least
 * MIN_FILL_MS after fetching one. With a shared store configured each token can be used once.
 *
 * Set FORM_TOKEN_SECRET (`openssl rand -hex 32`) in Vercel.
 *
 * FAIL CLOSED: in production, a missing or too-short secret makes verification return "unconfigured",
 * which the route turns into a refusal. The check is skipped only outside production (local development).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { redisConfig, redisPipeline } from "@/lib/rate-limit";

export const MIN_FILL_MS = 3000;
export const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours to complete a form

const secret = () => process.env.FORM_TOKEN_SECRET || "";
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest("hex");

export function tokenEnabled() {
  return secret().length >= 16;
}

export function issueToken(now = Date.now()): string {
  const key = secret();
  const nonce = randomBytes(8).toString("hex");
  const payload = `${now}.${nonce}`;
  return `${payload}.${sign(payload, key)}`;
}

export type TokenCheck = "ok" | "missing" | "invalid" | "too_fast" | "expired" | "skipped" | "unconfigured";

export function verifyToken(token: string, now = Date.now()): TokenCheck {
  const key = secret();
  if (key.length < 16) return process.env.NODE_ENV === "production" ? "unconfigured" : "skipped";
  if (!token) return "missing";
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d{10,16}$/.test(parts[0]) || !/^[0-9a-f]{16}$/.test(parts[1]) || !/^[0-9a-f]{64}$/.test(parts[2])) return "invalid";
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

/**
 * One-time use. Call only after verifyToken() returned "ok". Returns false when this token was already used.
 * If the shared store is unavailable the token is accepted: the rate limiter (which fails closed) has already
 * bounded the attempts, so a Redis outage must not stop genuine customers from sending a request.
 */
export async function consumeToken(token: string): Promise<boolean> {
  if (!redisConfig()) return true;
  const id = token.split(".").slice(0, 2).join(".");
  try {
    const [r] = await redisPipeline([["SET", `samsal:ft:${id}`, "1", "NX", "EX", String(Math.ceil(MAX_AGE_MS / 1000))]]);
    return r?.result === "OK";
  } catch {
    return true;
  }
}
