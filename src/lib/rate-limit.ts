/**
 * Rate limiting suitable for serverless.
 *
 * Serverless instances do not share memory, so an in-memory counter alone can be
 * bypassed by hitting different instances. This module therefore supports a
 * shared store through the Upstash Redis REST API (free tier is enough). It uses
 * plain fetch, so no extra dependency is needed.
 *
 * Configure BOTH of these in Vercel to enable shared limiting:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 * (Vercel Marketplace > Upstash Redis adds them automatically; the older
 *  KV_REST_API_URL / KV_REST_API_TOKEN names are also accepted.)
 *
 * Without them it falls back to a per-instance in-memory limiter. That still
 * slows casual abuse but is NOT a hard guarantee, and a warning is logged once.
 */
export type RateResult = { ok: boolean; retryAfter: number; shared: boolean };

type Entry = { count: number; resetAt: number };
const memory = new Map<string, Entry>();
let warned = false;

function memoryLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  if (memory.size > 500) for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
  const e = memory.get(key);
  if (!e || e.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0, shared: false };
  }
  e.count += 1;
  return e.count > limit
    ? { ok: false, retryAfter: Math.ceil((e.resetAt - now) / 1000), shared: false }
    : { ok: true, retryAfter: 0, shared: false };
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export async function rateLimit(key: string, limit = 5, windowMs = 10 * 60 * 1000): Promise<RateResult> {
  const cfg = redisConfig();
  if (!cfg) {
    if (!warned && process.env.NODE_ENV === "production") {
      warned = true;
      console.warn(
        "[rate-limit] No shared store configured (UPSTASH_REDIS_REST_URL/TOKEN). Using per-instance memory limiter.",
      );
    }
    return memoryLimit(key, limit, windowMs);
  }

  const windowSec = Math.ceil(windowMs / 1000);
  const redisKey = `samsal:rl:${key}`;
  try {
    // Atomic pipeline: INCR, set expiry only on first hit, read remaining TTL.
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSec), "NX"],
        ["TTL", redisKey],
      ]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
    const data = (await res.json()) as { result?: unknown }[];
    const count = Number(data[0]?.result);
    const ttl = Number(data[2]?.result);
    if (!Number.isFinite(count)) throw new Error("Unexpected Upstash response");
    return count > limit
      ? { ok: false, retryAfter: ttl > 0 ? ttl : windowSec, shared: true }
      : { ok: true, retryAfter: 0, shared: true };
  } catch (err) {
    // Fail open to the local limiter rather than blocking genuine customers if the store is down.
    console.error("[rate-limit] Shared store error, falling back to memory:", err);
    return memoryLimit(key, limit, windowMs);
  }
}
