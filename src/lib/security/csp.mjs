/**
 * Content-Security-Policy and the other security headers, built in one place (pure functions, unit tested).
 *
 *  - Admin area: strict. Scripts run only with a per-request nonce ('strict-dynamic'); no inline script is trusted.
 *  - Public site: scripts need 'unsafe-inline' because the pages are statically cached and cannot carry a
 *    per-request nonce. Everything else is locked down (no plugins, no framing, same-origin forms, pinned hosts).
 * A violation is reported to /api/csp-report, which feeds the security dashboard.
 */

const TURNSTILE = "https://challenges.cloudflare.com";

function origin(u) {
  try {
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(o = {}) {
  const supa = origin(o.supabaseUrl);
  const supaWs = supa ? supa.replace(/^https:/, "wss:") : null;
  const script = o.nonce
    ? ["'self'", `'nonce-${o.nonce}'`, "'strict-dynamic'", ...(o.dev ? ["'unsafe-eval'"] : [])]
    : ["'self'", "'unsafe-inline'", TURNSTILE, ...(o.dev ? ["'unsafe-eval'"] : [])];
  const d = {
    "default-src": ["'self'"],
    "script-src": script,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...(supa ? [supa] : [])],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(supa ? [supa] : []), ...(supaWs ? [supaWs] : [])],
    "frame-src": [TURNSTILE],
    "media-src": ["'self'", ...(supa ? [supa] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };
  const parts = Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!o.dev) parts.push("upgrade-insecure-requests");
  if (o.reportUri) parts.push(`report-uri ${o.reportUri}`);
  return parts.join("; ");
}

export const HSTS = "max-age=63072000"; // two years. includeSubDomains/preload are deliberate opt-ins (see docs/SECURITY.md)

/** Headers for every response. The CSP is added separately (static for the public site, per-request in middleware for /admin). */
export function baseSecurityHeaders() {
  return [
    { key: "Strict-Transport-Security", value: HSTS },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-site" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
}

export function cspHeaderName(reportOnly) {
  return reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}

export function newNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
