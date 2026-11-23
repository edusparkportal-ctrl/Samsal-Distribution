/**
 * Security unit tests for the pure modules (no network, no database). Run: npm run test:security
 * Redis and Cloudflare are simulated by replacing global fetch.
 */
import assert from "node:assert/strict";
import { _resetMemoryLimiter, rateLimit } from "@/lib/rate-limit";
import { MAX_AGE_MS, MIN_FILL_MS, consumeToken, issueToken, verifyToken } from "@/lib/form-token";
import { verifyTurnstile } from "@/lib/captcha";
import { baseSecurityHeaders, buildCsp, newNonce } from "@/lib/security/csp.mjs";
import { STEP_UP_MAX_AGE_SECONDS, assuranceFromClaims, decodeJwtClaims, isRecentMfa, needsMfaMessage } from "@/lib/security/mfa";
import { clientIp, ipHint, originAllowed } from "@/lib/security/request";
import { missingPublicFormControls, securityConfig } from "@/lib/security/env";

const env = process.env as Record<string, string | undefined>;
const realFetch = globalThis.fetch;
let passed = 0;
const failures: string[] = [];
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; } catch (e) { failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`); }
}
const quiet = async <T,>(fn: () => Promise<T>) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
function setEnv(vars: Record<string, string | undefined>) { for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete env[k]; else env[k] = v; } }
const CLEAN = { NODE_ENV: "test", UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined, KV_REST_API_URL: undefined, KV_REST_API_TOKEN: undefined,
  FORM_TOKEN_SECRET: undefined, TURNSTILE_SECRET_KEY: undefined, NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined, CRON_SECRET: undefined };

/** A tiny Redis REST emulator (INCR / EXPIRE NX / TTL / SET NX EX) behind fetch. */
function fakeRedis(opts: { fail?: "http" | "throw" | "slow" | "shape" } = {}) {
  const store = new Map<string, { v: number | string; exp: number }>();
  const calls: string[][][] = [];
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    if (opts.fail === "throw") throw new Error("connect ECONNREFUSED");
    if (opts.fail === "slow") { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; }
    if (opts.fail === "http") return new Response("nope", { status: 503 });
    const cmds = JSON.parse(init?.body ?? "[]") as string[][];
    calls.push(cmds);
    if (opts.fail === "shape") return Response.json({ unexpected: true });
    const now = Date.now();
    const out = cmds.map(([c, k, a, b, d]) => {
      const e = store.get(k); const live = e && e.exp > now ? e : undefined;
      if (c === "INCR") { const n = (Number(live?.v) || 0) + 1; store.set(k, { v: n, exp: live?.exp ?? now + 1e9 }); return { result: n }; }
      if (c === "EXPIRE") { const x = store.get(k); if (x && (b !== "NX" || x.exp > now + 1e8)) x.exp = now + Number(a) * 1000; return { result: 1 }; }
      if (c === "TTL") { const x = store.get(k); return { result: x ? Math.ceil((x.exp - now) / 1000) : -2 }; }
      if (c === "SET") { if (live && d === undefined && b === "NX") return { result: null }; if (live && cmds[0].includes("NX")) return { result: null }; store.set(k, { v: a, exp: now + 1e6 }); return { result: "OK" }; }
      return { result: null };
    });
    return Response.json(out);
  }) as typeof fetch;
  return { store, calls };
}

(async () => {
  // ---------------- rate limiting ----------------
  setEnv(CLEAN); _resetMemoryLimiter();
  await t("dev: memory limiter allows up to the limit then blocks", async () => {
    const r = []; for (let i = 0; i < 7; i++) r.push((await rateLimit("t:dev", 5)).ok);
    assert.deepEqual(r, [true, true, true, true, true, false, false]);
  });
  setEnv({ NODE_ENV: "production" }); _resetMemoryLimiter();
  await t("production without Redis: default FAILS CLOSED", async () => {
    const r = await quiet(() => rateLimit("t:p1", 5));
    assert.equal(r.ok, false); assert.equal(r.reason, "store_missing"); assert.equal(r.degraded, true);
  });
  await t("production without Redis: degraded mode uses a stricter local limit (half)", async () => {
    const res = []; for (let i = 0; i < 5; i++) res.push((await quiet(() => rateLimit("t:p2", 6, 60000, { failure: "degraded" }))).ok);
    assert.deepEqual(res, [true, true, true, false, false]);
  });
  setEnv({ NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "x".repeat(20) }); _resetMemoryLimiter();
  await t("shared store: counts, blocks, reports TTL, separates keys", async () => {
    const f = fakeRedis();
    const r = []; for (let i = 0; i < 7; i++) r.push(await rateLimit("t:1.2.3.4", 5, 600000));
    assert.deepEqual(r.map((x) => x.ok), [true, true, true, true, true, false, false]);
    assert.equal(r[5].shared, true); assert.equal(r[5].reason, "limited"); assert.ok(r[5].retryAfter > 500 && r[5].retryAfter <= 600);
    assert.equal((await rateLimit("t:5.6.7.8", 5, 600000)).ok, true);
    // identifying values are hashed in the store key
    for (const k of f.store.keys()) assert.ok(!k.includes("1.2.3.4") && k.startsWith("samsal:rl:t:"), k);
  });
  for (const mode of ["http", "throw", "slow", "shape"] as const) {
    await t(`Redis ${mode} failure: closed by default`, async () => {
      fakeRedis({ fail: mode }); _resetMemoryLimiter();
      const r = await quiet(() => rateLimit("t:fail-" + mode, 5));
      assert.equal(r.ok, false); assert.equal(r.reason, "store_error"); assert.ok(r.retryAfter >= 1);
    });
    await t(`Redis ${mode} failure: degraded mode still throttles`, async () => {
      fakeRedis({ fail: mode }); _resetMemoryLimiter();
      const res = []; for (let i = 0; i < 4; i++) res.push((await quiet(() => rateLimit("t:deg-" + mode, 4, 60000, { failure: "degraded" }))).ok);
      assert.deepEqual(res, [true, true, false, false]);
    });
  }
  globalThis.fetch = realFetch;

  // ---------------- form token ----------------
  setEnv(CLEAN);
  await t("token: skipped outside production without a secret", () => assert.equal(verifyToken("anything"), "skipped"));
  setEnv({ NODE_ENV: "production" });
  await t("token: FAILS CLOSED in production without a secret", () => assert.equal(verifyToken("anything"), "unconfigured"));
  setEnv({ NODE_ENV: "production", FORM_TOKEN_SECRET: "short" });
  await t("token: a too-short secret counts as unconfigured", () => assert.equal(verifyToken("x"), "unconfigured"));
  setEnv({ NODE_ENV: "production", FORM_TOKEN_SECRET: "0123456789abcdef0123456789abcdef" });
  const now = Date.now();
  await t("token: ok after the minimum fill time", () => assert.equal(verifyToken(issueToken(now), now + MIN_FILL_MS + 10), "ok"));
  await t("token: too fast", () => assert.equal(verifyToken(issueToken(now), now + 500), "too_fast"));
  await t("token: expired", () => assert.equal(verifyToken(issueToken(now), now + MAX_AGE_MS + 1000), "expired"));
  await t("token: tampered timestamp / signature / format", () => {
    const tok = issueToken(now);
    assert.equal(verifyToken(tok.replace(/^\d+/, String(now - 100000)), now + 5000), "invalid");
    assert.equal(verifyToken(tok.slice(0, -1) + (tok.endsWith("0") ? "1" : "0"), now + 5000), "invalid");
    assert.equal(verifyToken("a.b.c", now), "invalid");
    assert.equal(verifyToken("", now), "missing");
    assert.equal(verifyToken(`${now}.${"0".repeat(16)}.${"0".repeat(64)}`, now + 5000), "invalid");
  });
  await t("token: signed with a different secret is invalid", () => {
    const tok = issueToken(now); env.FORM_TOKEN_SECRET = "another-secret-another-secret-1234";
    assert.equal(verifyToken(tok, now + 5000), "invalid"); env.FORM_TOKEN_SECRET = "0123456789abcdef0123456789abcdef";
  });
  await t("token: nonces are unique and unpredictable", () => {
    const s = new Set(); for (let i = 0; i < 200; i++) s.add(issueToken(now).split(".")[1]); assert.equal(s.size, 200);
  });
  await t("token: single use with a shared store, tolerant of an outage", async () => {
    const tok = issueToken(now);
    assert.equal(await consumeToken(tok), true); // no Redis configured -> accepted
    setEnv({ UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "x".repeat(20) });
    fakeRedis();
    assert.equal(await consumeToken(tok), true);
    assert.equal(await consumeToken(tok), false, "second use must be refused");
    fakeRedis({ fail: "throw" });
    assert.equal(await consumeToken(issueToken(now)), true, "store outage must not block genuine customers");
    globalThis.fetch = realFetch; setEnv({ UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined });
  });

  // ---------------- captcha ----------------
  const turnstile = (resp: () => Response | Promise<Response>) => ((async () => resp()) as unknown as typeof fetch);
  setEnv({ ...CLEAN });
  await t("captcha: skipped in development without a secret", async () => assert.deepEqual(await verifyTurnstile("", "1.1.1.1"), { ok: true, skipped: true }));
  setEnv({ NODE_ENV: "production" });
  await t("captcha: FAILS CLOSED in production without a secret", async () => assert.deepEqual(await verifyTurnstile("tok", "1.1.1.1"), { ok: false, reason: "unconfigured" }));
  setEnv({ NODE_ENV: "production", TURNSTILE_SECRET_KEY: "secret" });
  await t("captcha: missing token is refused", async () => assert.deepEqual(await verifyTurnstile("", "1.1.1.1"), { ok: false, reason: "missing_token" }));
  await t("captcha: oversized token is refused without a network call", async () => {
    let called = false; const f = (async () => { called = true; return Response.json({ success: true }); }) as unknown as typeof fetch;
    assert.equal((await verifyTurnstile("x".repeat(3000), "1.1.1.1", f)).ok, false); assert.equal(called, false);
  });
  await t("captcha: success", async () => assert.deepEqual(await verifyTurnstile("tok", "1.1.1.1", turnstile(() => Response.json({ success: true }))), { ok: true }));
  await t("captcha: rejected", async () => assert.deepEqual(await verifyTurnstile("tok", "1.1.1.1", turnstile(() => Response.json({ success: false }))), { ok: false, reason: "rejected" }));
  await t("captcha: Cloudflare outage / error / bad JSON all refuse", async () => {
    assert.deepEqual(await verifyTurnstile("tok", "1.1.1.1", turnstile(() => new Response("x", { status: 500 }))), { ok: false, reason: "unavailable" });
    assert.deepEqual(await verifyTurnstile("tok", "1.1.1.1", turnstile(() => { throw new Error("network"); })), { ok: false, reason: "unavailable" });
    assert.deepEqual(await verifyTurnstile("tok", "1.1.1.1", turnstile(() => new Response("not json"))), { ok: false, reason: "unavailable" });
  });
  await t("captcha: success must be exactly true", async () => assert.equal((await verifyTurnstile("tok", "1.1.1.1", turnstile(() => Response.json({ success: "true" })))).ok, false));

  // ---------------- configuration report ----------------
  setEnv({ ...CLEAN });
  await t("config: reports presence only, and lists what the public forms still need", () => {
    assert.deepEqual(missingPublicFormControls(), ["TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "FORM_TOKEN_SECRET", "UPSTASH_REDIS_REST_URL/TOKEN"]);
    setEnv({ TURNSTILE_SECRET_KEY: "s", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k", FORM_TOKEN_SECRET: "x".repeat(32), UPSTASH_REDIS_REST_URL: "https://r", UPSTASH_REDIS_REST_TOKEN: "t" });
    assert.deepEqual(missingPublicFormControls(), []);
    assert.ok(Object.values(securityConfig()).every((v) => typeof v === "boolean"));
  });
  setEnv({ ...CLEAN });

  // ---------------- CSP and headers ----------------
  await t("csp: admin policy is nonce-based with no 'unsafe-inline' for scripts", () => {
    const n = newNonce(); const p = buildCsp({ nonce: n, supabaseUrl: "https://abc.supabase.co", reportUri: "/api/csp-report" });
    const script = p.split("; ").find((d) => d.startsWith("script-src"))!;
    assert.ok(script.includes(`'nonce-${n}'`) && script.includes("'strict-dynamic'")); assert.ok(!script.includes("unsafe-inline")); assert.ok(!script.includes("unsafe-eval"));
    assert.ok(p.includes("object-src 'none'") && p.includes("base-uri 'self'") && p.includes("form-action 'self'") && p.includes("frame-ancestors 'self'"));
    assert.ok(p.includes("connect-src 'self' https://challenges.cloudflare.com https://abc.supabase.co wss://abc.supabase.co") && p.includes("upgrade-insecure-requests") && p.includes("report-uri /api/csp-report"));
  });
  await t("csp: public policy allows Turnstile only, never eval, pins images to Supabase", () => {
    const p = buildCsp({ supabaseUrl: "https://abc.supabase.co" });
    assert.ok(p.includes("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com") && !p.includes("unsafe-eval"));
    assert.ok(p.includes("frame-src https://challenges.cloudflare.com") && p.includes("img-src 'self' data: blob: https://abc.supabase.co"));
    assert.ok(!/\*/.test(p), "no wildcard sources");
  });
  await t("csp: development adds eval and drops upgrade-insecure-requests", () => {
    const p = buildCsp({ dev: true }); assert.ok(p.includes("'unsafe-eval'") && !p.includes("upgrade-insecure-requests"));
  });
  await t("csp: a malformed Supabase URL is ignored, not injected", () => assert.ok(!buildCsp({ supabaseUrl: "javascript:alert(1)" }).includes("javascript")));
  await t("csp: nonces are 128-bit and unique", () => { const s = new Set(); for (let i = 0; i < 100; i++) s.add(newNonce()); assert.equal(s.size, 100); assert.ok(atob(newNonce()).length === 16); });
  await t("headers: HSTS two years, nosniff, framing, referrer, permissions, COOP/CORP", () => {
    const h = Object.fromEntries(baseSecurityHeaders().map((x) => [x.key, x.value]));
    assert.match(h["Strict-Transport-Security"], /^max-age=(\d+)/); assert.ok(Number(/max-age=(\d+)/.exec(h["Strict-Transport-Security"])![1]) >= 31536000);
    assert.equal(h["X-Content-Type-Options"], "nosniff"); assert.equal(h["X-Frame-Options"], "SAMEORIGIN");
    assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin"); assert.ok(h["Permissions-Policy"].includes("camera=()") && h["Permissions-Policy"].includes("payment=()"));
    assert.equal(h["Cross-Origin-Opener-Policy"], "same-origin"); assert.equal(h["Cross-Origin-Resource-Policy"], "same-site");
  });

  // ---------------- MFA claims ----------------
  const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  const nowS = Math.floor(Date.now() / 1000);
  await t("mfa: reads aal and the last TOTP time from the token", () => {
    const a = assuranceFromClaims(decodeJwtClaims(jwt({ aal: "aal2", amr: [{ method: "password", timestamp: nowS - 900 }, { method: "totp", timestamp: nowS - 60 }, { method: "totp", timestamp: nowS - 500 }] })));
    assert.equal(a.aal, "aal2"); assert.equal(a.lastTotpAt, nowS - 60);
  });
  await t("mfa: password-only, forged and malformed tokens are aal1", () => {
    assert.equal(assuranceFromClaims(decodeJwtClaims(jwt({ aal: "aal1", amr: [{ method: "password", timestamp: nowS }] }))).aal, "aal1");
    assert.equal(assuranceFromClaims(decodeJwtClaims("garbage")).aal, "aal1"); assert.equal(assuranceFromClaims(decodeJwtClaims("a.@@@.c")).aal, "aal1");
    assert.equal(assuranceFromClaims(decodeJwtClaims(null)).aal, "aal1"); assert.equal(assuranceFromClaims(decodeJwtClaims(jwt({ aal: ["aal2"], amr: "totp" }))).aal, "aal1");
  });
  await t("mfa: 'recent' is aal2 AND a TOTP check inside the window", () => {
    assert.equal(isRecentMfa({ aal: "aal2", lastTotpAt: nowS - 100 }, STEP_UP_MAX_AGE_SECONDS, nowS), true);
    assert.equal(isRecentMfa({ aal: "aal2", lastTotpAt: nowS - STEP_UP_MAX_AGE_SECONDS - 1 }, STEP_UP_MAX_AGE_SECONDS, nowS), false);
    assert.equal(isRecentMfa({ aal: "aal1", lastTotpAt: nowS }, STEP_UP_MAX_AGE_SECONDS, nowS), false);
    assert.equal(isRecentMfa({ aal: "aal2", lastTotpAt: null }, STEP_UP_MAX_AGE_SECONDS, nowS), false);
  });
  await t("mfa: the database marker is recognised", () => { assert.ok(needsMfaMessage("[mfa] This action needs a fresh authenticator code.")); assert.ok(!needsMfaMessage("Not permitted")); });

  // ---------------- request helpers ----------------
  const H = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  await t("ip: platform headers win over a client-supplied x-forwarded-for", () => {
    assert.equal(clientIp(H({ "x-vercel-forwarded-for": "41.1.2.3", "x-forwarded-for": "6.6.6.6, 41.1.2.3" })), "41.1.2.3");
    assert.equal(clientIp(H({ "x-real-ip": "41.9.9.9", "x-forwarded-for": "6.6.6.6" })), "41.9.9.9");
    assert.equal(clientIp(H({ "x-forwarded-for": "7.7.7.7, 8.8.8.8" })), "7.7.7.7"); assert.equal(clientIp(H({})), "unknown");
  });
  await t("ip: log hints are masked", () => { assert.equal(ipHint("41.89.12.200"), "41.89.12.x"); assert.equal(ipHint("2001:db8:1:2::9"), "2001:db8:1::x"); assert.equal(ipHint("unknown"), null); });
  await t("origin: same host and configured site pass, others fail; localhost only outside production", () => {
    assert.ok(originAllowed(H({ origin: "https://samsal.co.ke", host: "samsal.co.ke" }), undefined));
    assert.ok(originAllowed(H({ origin: "https://samsal.co.ke", host: "x.vercel.app" }), "https://samsal.co.ke"));
    assert.ok(!originAllowed(H({ origin: "https://evil.example", host: "samsal.co.ke" }), "https://samsal.co.ke"));
    assert.ok(!originAllowed(H({ origin: "not a url", host: "samsal.co.ke" }), undefined)); assert.ok(originAllowed(H({ host: "samsal.co.ke" }), undefined));
    assert.ok(originAllowed(H({ origin: "http://localhost:3000", host: "x" }), undefined)); env.NODE_ENV = "production";
    assert.ok(!originAllowed(H({ origin: "http://localhost:3000", host: "x" }), undefined)); env.NODE_ENV = "test";
  });

  globalThis.fetch = realFetch;
  if (failures.length) { console.error(`SECURITY UNIT TESTS: ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.error("  - " + f)); process.exit(1); }
  console.log(`SECURITY UNIT TESTS: ${passed} passed, 0 failed`);
})();
