/**
 * Minimal in-memory rate limiter (per server instance).
 *
 * Good enough as a first line of defence together with the honeypot, timing
 * check and optional Turnstile. On serverless platforms memory is not shared
 * between instances; for stricter limits swap this for Upstash Redis / Vercel KV.
 */
type Entry = { count: number; resetAt: number };
const hits = new Map<string, Entry>();

export function rateLimit(key: string, limit = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();

  // opportunistic cleanup
  if (hits.size > 500) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }

  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}
