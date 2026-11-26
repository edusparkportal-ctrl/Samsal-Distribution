#!/usr/bin/env node
/**
 * Static security audit (no dependencies, no network). Run: npm run security:audit
 * Fails (exit 1) when a rule below is broken. These are the rules a reviewer would check by hand, made automatic:
 *
 *  R1  every exported server action checks who is calling it
 *  R2  every admin route handler checks who is calling it; every public API route is on a reviewed list
 *  R3  the service-role (RLS-bypassing) client is imported only by reviewed files
 *  R4  dangerouslySetInnerHTML only in reviewed files
 *  R5  no secret-looking name is exposed to the browser (NEXT_PUBLIC_*)
 *  R6  no eval / new Function / child_process; no Math.random in security code
 *  R7  files that read a "next" redirect target use safeNext()
 *  R8  no hard-coded secrets in tracked files
 *  R9  every table created by a migration has Row Level Security enabled by some migration
 *  R10 security headers and the fail-closed controls are still wired in
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const notes = [];
const fail = (rule, file, msg) => failures.push(`${rule}  ${file}: ${msg}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p) => relative(root, p).split("\\").join("/");
const read = (p) => readFileSync(p, "utf8");
const src = walk(join(root, "src")).filter((f) => /\.(ts|tsx|mjs)$/.test(f));

// ---- R1: server actions ------------------------------------------------------------------
const GUARDS = /\b(requireStaff|requirePermission|requireStepUp|checkPermission|checkStepUp|getSession|signedInUser|requireCustomer)\s*\(/;
// Public by design: they authenticate the person (or are the sign-in flow itself).
const PUBLIC_ACTIONS = new Set(["src/app/admin/login/actions.ts:signIn", "src/app/admin/login/actions.ts:requestPasswordReset", "src/app/admin/login/actions.ts:signOut",
  "src/app/admin/forgot-password/actions.ts:requestPasswordReset",
  // Customer portal sign-in flow: authenticate the person, rate limited. setPortalPassword verifies the session user itself.
  "src/app/portal/(auth)/actions.ts:portalSignIn", "src/app/portal/(auth)/actions.ts:registerCustomer", "src/app/portal/(auth)/actions.ts:requestPortalReset",
  "src/app/portal/(auth)/actions.ts:setPortalPassword", "src/app/portal/(auth)/actions.ts:portalSignOut"]);
let actionCount = 0;
for (const f of src) {
  const text = read(f);
  if (!/^\s*["']use server["']/m.test(text.slice(0, 400))) continue;
  // Local (non-exported) helpers that perform the check, e.g. "async function gate() { await checkPermission(...) }".
  const helpers = [...text.matchAll(/\n(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)].filter((m) => GUARDS.test(m[2])).map((m) => m[1]);
  const guarded = (body) => GUARDS.test(body) || helpers.some((h) => new RegExp(`\\b${h}\\s*\\(`).test(body));
  const parts = text.split(/\n(?=export\s+async\s+function\s+)/).slice(1);
  for (const part of parts) {
    const name = /export\s+async\s+function\s+(\w+)/.exec(part)?.[1];
    actionCount++;
    if (PUBLIC_ACTIONS.has(`${rel(f)}:${name}`)) continue;
    if (!guarded(part)) fail("R1", rel(f), `server action "${name}" does not check the caller (requireStaff / checkPermission / ...)`);
  }
}
notes.push(`R1 ${actionCount} server actions checked`);

// ---- R2: route handlers ---------------------------------------------------------------------
const PUBLIC_ROUTES = {
  "src/app/api/quote/route.ts": "public form: origin, mandatory config, size, rate limit, token, CAPTCHA",
  "src/app/api/quote/token/route.ts": "issues signed form token, rate limited",
  "src/app/api/csp-report/route.ts": "browser CSP reports: size and rate limited, sanitised",
  "src/app/api/health/route.ts": "uptime probe: reveals nothing but ok/unavailable",
  "src/app/api/automation/dispatch/route.ts": "scheduler: CRON_SECRET bearer, constant-time compare",
  "src/app/brand/logo/route.ts": "public company logo: no input, serves only the uploaded public-bucket image (or the built-in logo), cached",
  "src/app/auth/confirm/route.ts": "email link: allow-listed types, rate limited, safeNext",
  "src/app/api/mpesa/callback/[token]/route.ts": "Safaricom callback: secret path token (constant-time), 20KB cap, success confirmed by our own STK Query, applied once in the database",
};
let routeCount = 0;
for (const f of src.filter((x) => /\/route\.ts$/.test(x))) {
  routeCount++;
  const r = rel(f);
  const text = read(f);
  if (r.startsWith("src/app/admin/")) {
    if (!GUARDS.test(text)) fail("R2", r, "admin route handler does not check the caller");
  } else if (r.startsWith("src/app/portal/")) {
    // Customer portal routes: signed-in customer only, and data comes from portal_* functions (ownership is decided in the database).
    if (!/getPortalSession\(|requireCustomer\(/.test(text) && !/rpc\("portal_mpesa_status"/.test(text)) fail("R2", r, "portal route handler does not check that the caller is an approved customer");
    if (/createServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(text)) fail("R2", r, "portal route handler uses the service-role client directly");
  } else if (!(r in PUBLIC_ROUTES)) {
    fail("R2", r, "new public route: review it (auth, rate limit, input size) and add it to PUBLIC_ROUTES in scripts/security-audit.mjs");
  }
}
for (const k of Object.keys(PUBLIC_ROUTES)) if (!existsSync(join(root, k))) fail("R2", k, "listed public route no longer exists: update PUBLIC_ROUTES");
notes.push(`R2 ${routeCount} route handlers checked`);

// ---- R3: service-role client ----------------------------------------------------------------
const SERVICE_OK = new Set(["src/lib/security/env.ts", // reports only whether the key exists
  "src/lib/supabase/admin.ts", "src/lib/supabase/public.ts", "src/lib/enquiries.ts", "src/lib/automation/dispatch.ts", "src/lib/security/events.ts",
  "src/app/admin/(panel)/settings/users/actions.ts",
  "src/app/portal/(auth)/actions.ts", // portal registration sends the invitation; CAPTCHA + closed rate limits
  "src/lib/mpesa/service.ts"]); // M-Pesa: only the server-only mpesa_* functions + reading a request's Safaricom id after ownership is proven
for (const f of src) {
  const text = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  if (/createServiceClient\s*\(|process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(text) && !SERVICE_OK.has(rel(f))) fail("R3", rel(f), "uses the service-role client or key; it bypasses Row Level Security. Review, then add to SERVICE_OK");
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(text) && /["']use client["']/.test(text.slice(0, 200))) fail("R3", rel(f), "client component references the service-role key");
}

// ---- R4: raw HTML -----------------------------------------------------------------------------
const HTML_OK = new Set(["src/components/ui.tsx"]);
for (const f of src) if (/dangerouslySetInnerHTML/.test(read(f)) && !HTML_OK.has(rel(f))) fail("R4", rel(f), "dangerouslySetInnerHTML outside the reviewed list");
{
  const t = read(join(root, "src/components/ui.tsx"));
  const uses = t.match(/dangerouslySetInnerHTML[^\n]*\n?[^\n]*/g) ?? [];
  if (uses.some((u) => !/JSON\.stringify|ld\+json/i.test(t))) fail("R4", "src/components/ui.tsx", "raw HTML is not JSON-LD");
}

// ---- R5: public env names -----------------------------------------------------------------------
for (const f of [...src, ...["next.config.mjs", ".env.example"].filter((x) => existsSync(join(root, x))).map((x) => join(root, x))]) {
  for (const m of read(f).matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
    if (/(SECRET|SERVICE|PRIVATE|PASSWORD|TOKEN|API_KEY)/.test(m[0]) && !/TURNSTILE_SITE_KEY/.test(m[0])) fail("R5", rel(f), `${m[0]} would be sent to every browser; secrets must not use the NEXT_PUBLIC_ prefix`);
  }
}

// ---- R6: dangerous APIs --------------------------------------------------------------------------
const NO_RANDOM = /^(src\/lib\/(security|auth)\/|src\/lib\/(form-token|rate-limit|captcha)\.ts)/;
for (const f of src) {
  const t = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  if (/\beval\s*\(|new\s+Function\s*\(|child_process/.test(t)) fail("R6", rel(f), "eval / new Function / child_process");
  if (NO_RANDOM.test(rel(f)) && /Math\.random\s*\(/.test(t)) fail("R6", rel(f), "Math.random in security code; use crypto");
}

// ---- R7: redirects ---------------------------------------------------------------------------------
for (const f of src) {
  const t = read(f);
  if (/(get\(\s*["']next["']\s*\)|\bsp\.next\b|\.next\b\s*\?\?)/.test(t) && /redirect\s*\(/.test(t) && !/safeNext|safePortalNext/.test(t)) fail("R7", rel(f), 'reads a "next" target and redirects without safeNext()');
}

// ---- R8: secrets in tracked files -----------------------------------------------------------------
const SECRET_PATTERNS = [
  [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, "JWT-looking token"],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/\bre_[A-Za-z0-9]{20,}\b/, "Resend API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/postgres(ql)?:\/\/[^\s:@/]+:(?!password|postgres|\*+|<|\$|\{|xxx|your)[^\s@/]{6,}@/i, "database URL with a password"],
  [/\b(ghp|gho|ghs)_[A-Za-z0-9]{30,}\b/, "GitHub token"],
  [/\bsk_live_[A-Za-z0-9]{10,}\b/, "payment secret key"],
];
let tracked = [];
try { tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); } catch { tracked = walk(root).map(rel); }
let scanned = 0;
for (const f of tracked) {
  if (/(package-lock\.json|\.(png|jpe?g|webp|avif|ico|pdf|woff2?|svg)$)/.test(f) || !existsSync(join(root, f))) continue;
  if (f === "scripts/security-audit.mjs" || f.startsWith("tests/")) continue; // contains the patterns / fixtures
  let text;
  try { text = read(join(root, f)); } catch { continue; }
  if (text.length > 2_000_000) continue;
  scanned++;
  for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) fail("R8", f, `looks like a ${label}`);
}
notes.push(`R8 ${scanned} tracked files scanned for secrets`);

// ---- R9: RLS on every table ---------------------------------------------------------------------------
const migDir = join(root, "supabase/migrations");
if (existsSync(migDir)) {
  const all = readdirSync(migDir).filter((n) => n.endsWith(".sql")).map((n) => read(join(migDir, n))).join("\n");
  const created = [...all.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)].map((m) => m[1].toLowerCase());
  const enabled = new Set([...all.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi)].map((m) => m[1].toLowerCase()));
  // Tables enabled by a loop are not visible to a text scan; the database test ("every table has RLS") is authoritative for them.
  const viaLoop = [...new Set(created)].filter((t) => !enabled.has(t));
  const loopCovered = /foreach|for\s+\w+\s+in\s+(?:select|array)/i.test(all) && /enable row level security/i.test(all);
  if (viaLoop.length && !loopCovered) for (const t of viaLoop) fail("R9", "supabase/migrations", `table "${t}" never has Row Level Security enabled`);
  else if (viaLoop.length) notes.push(`R9 ${viaLoop.length} tables are enabled through a loop (verified by the database test)`);
  notes.push(`R9 ${new Set(created).size} tables checked`);
}

// ---- R10: wiring ------------------------------------------------------------------------------------------
const mustContain = (file, re, why) => { if (!existsSync(join(root, file)) || !re.test(read(join(root, file)))) fail("R10", file, why); };
mustContain("next.config.mjs", /baseSecurityHeaders/, "security headers are not wired into next.config.mjs");
mustContain("next.config.mjs", /buildCsp/, "CSP is not wired into next.config.mjs");
mustContain("src/middleware.ts", /buildCsp/, "admin nonce CSP is not wired into the middleware");
mustContain("src/lib/security/csp.mjs", /Strict-Transport-Security/, "HSTS header missing");
mustContain("src/lib/captcha.ts", /NODE_ENV === "production"/, "CAPTCHA no longer distinguishes production (fail-closed)");
mustContain("src/lib/form-token.ts", /unconfigured/, "form token no longer fails closed");
mustContain("src/lib/rate-limit.ts", /store_missing/, "rate limiter no longer fails closed without a store");
mustContain("src/app/api/quote/route.ts", /missingPublicFormControls/, "quote route no longer refuses submissions when controls are missing");
mustContain("src/lib/auth/session.ts", /my_mfa_required/, "session gate no longer checks MFA");

mustContain("src/middleware.ts", /\/portal\/:path\*/, "the customer portal is not covered by the middleware (session refresh, nonce CSP, sign-in redirect)");
mustContain("next.config.mjs", /\(\?!admin\|portal\)/, "the portal would get the static public CSP instead of the nonce CSP");

// ---- R11: customer portal reads data only through the portal_* database functions ---------------------------------
// Customers hold no table rights. The one table a portal file may read directly is the caller's own application row.
let portalFiles = 0;
for (const f of src) {
  const r = rel(f);
  if (!/^src\/(app\/portal|components\/portal|lib\/portal)\//.test(r)) continue;
  portalFiles++;
  const text = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const m of text.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]/g)) {
    const allowed = m[1] === "customer_accounts" || (m[1] === "modules" && r === "src/app/portal/(auth)/actions.ts"); // registration checks the module switch
    if (!allowed) fail("R11", r, `portal code reads table "${m[1]}" directly; use a portal_* function so ownership is enforced in the database`);
  }
  for (const m of text.matchAll(/\.rpc\(\s*["'`]([a-z_]+)["'`]/g)) {
    if (!m[1].startsWith("portal_")) fail("R11", r, `portal code calls "${m[1]}"; only portal_* functions are allowed`);
  }
  if (/createServiceClient|SUPABASE_SERVICE_ROLE_KEY/.test(text) && r !== "src/app/portal/(auth)/actions.ts") fail("R11", r, "portal code uses the service-role client");
}
notes.push(`R11 ${portalFiles} portal files checked`);

for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.error(`\nSECURITY AUDIT FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("SECURITY AUDIT PASSED");
