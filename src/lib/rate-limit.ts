/**
 * Shared rate limiting for serverless (Upstash Redis REST API, plain fetch, no dependency).
 *
 * Serverless instances do not share memory, so an in-memory counter alone can be bypassed by reaching
 * different instances. Production therefore needs the shared store:
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (the older KV_REST_API_URL / KV_REST_API_TOKEN also work)
 *
 * FAILURE HANDLING (decided per call with `failure`):
 *   "closed"   (default in production) when the store is missing, slow or erroring the request is REFUSED.
 *              Use for public forms: an attacker must not get unlimited attempts because Redis is down.
 *   "degraded" falls back to a stricter per-instance limiter (half the limit, at least 1) and flags the result.
 *              Use for staff sign-in and MFA, so an outage never locks every administrator out, while
 *              guessing stays throttled (and Supabase applies its own auth limits as well).
 * Outside production the in-memory limiter is used when no store is configured (local development).
 */
import { createHash } from "node:crypto";

export type RateFailure = "closed" | "degraded";
export type RateResult = {
  ok: boolean;
  retryAfter: number;
  /** true when the shared store made the decision */
  shared: boolean;
  /** true when the decision came from the fallback because the store failed or is missing */
  degraded?: boolean;
  reason?: "limited" | "store_missing" | "store_error";
};
export type RateOptions = { failure?: RateFailure };

type Entry = { count: number; resetAt: number };
const memory = new Map<string, Entry>();
const STORE_TIMEOUT_MS = 1500;
let lastWarn = 0;

function warn(msg: string, err?: unknown) {
  const now = Date.now();
  if (now - lastWarn < 60_000) return; // at most one line a minute, so an outage does not flood the logs
  lastWarn = now;
  console.error(`[rate-limit] ${msg}`, err instanceof Error ? err.message : err ?? "");
}

function memoryLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (memory.size > 500) for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
  const e = memory.get(key);
  if (!e || e.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  e.count += 1;
  return e.count > limit ? { ok: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) } : { ok: true, retryAfter: 0 };
}

export function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url?.trim() && token?.trim() ? { url: url.trim().replace(/\/$/, ""), token: token.trim() } : null;
}

/** Run Redis commands as one pipeline. Throws on any HTTP, timeout or shape problem. */
export async function redisPipeline(commands: string[][]): Promise<{ result?: unknown; error?: string }[]> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
    signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string }[];
  if (!Array.isArray(data) || data.length !== commands.length) throw new Error("Unexpected Redis response");
  const bad = data.find((d) => d?.error);
  if (bad) throw new Error(`Redis error: ${String(bad.error).slice(0, 80)}`);
  return data;
}

/** Keys never contain raw emails or addresses: the identifying part is hashed. */
function storeKey(key: string): string {
  const i = key.indexOf(":");
  const ns = (i > 0 ? key.slice(0, i) : "k").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "k";
  const rest = i > 0 ? key.slice(i + 1) : key;
  return `samsal:rl:${ns}:${createHash("sha256").update(rest).digest("hex").slice(0, 32)}`;
}

function failMode(opts?: RateOptions): RateFailure {
  return opts?.failure ?? "closed";
}

function onStoreProblem(reason: "store_missing" | "store_error", key: string, limit: number, windowMs: number, opts?: RateOptions): RateResult {
  if (failMode(opts) === "degraded") {
    const r = memoryLimit(`deg:${key}`, Math.max(1, Math.floor(limit / 2)), windowMs);
    return { ok: r.ok, retryAfter: r.retryAfter, shared: false, degraded: true, reason: r.ok ? undefined : "limited" };
  }
  return { ok: false, retryAfter: 60, shared: false, degraded: true, reason };
}

export async function rateLimit(key: string, limit = 5, windowMs = 10 * 60 * 1000, opts?: RateOptions): Promise<RateResult> {
  const cfg = redisConfig();
  if (!cfg) {
    if (process.env.NODE_ENV === "production") {
      warn("No shared store configured (UPSTASH_REDIS_REST_URL/TOKEN) in production.");
      return onStoreProblem("store_missing", key, limit, windowMs, opts);
    }
    const r = memoryLimit(key, limit, windowMs);
    return { ok: r.ok, retryAfter: r.retryAfter, shared: false, reason: r.ok ? undefined : "limited" };
  }

  const windowSec = Math.ceil(windowMs / 1000);
  const redisKey = storeKey(key);
  try {
    // Atomic pipeline: INCR, set the expiry only on the first hit, read the remaining TTL.
    const data = await redisPipeline([["INCR", redisKey], ["EXPIRE", redisKey, String(windowSec), "NX"], ["TTL", redisKey]]);
    const count = Number(data[0]?.result);
    const ttl = Number(data[2]?.result);
    if (!Number.isFinite(count)) throw new Error("Unexpected Redis response");
    if (ttl === -1) await redisPipeline([["EXPIRE", redisKey, String(windowSec)]]).catch(() => undefined); // never leave a key without an expiry
    return count > limit
      ? { ok: false, retryAfter: ttl > 0 ? ttl : windowSec, shared: true, reason: "limited" }
      : { ok: true, retryAfter: 0, shared: true };
  } catch (err) {
    warn("Shared store error.", err);
    return onStoreProblem("store_error", key, limit, windowMs, opts);
  }
}

/** Test helper: clears the in-memory counters. */
export function _resetMemoryLimiter() {
  memory.clear();
  lastWarn = 0;
}
