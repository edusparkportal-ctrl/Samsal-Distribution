import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security/request";
import { logSecurityEvent } from "@/lib/security/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024;
const clip = (v: unknown, n = 160) => (typeof v === "string" ? v.replace(/[\r\n\t]/g, " ").slice(0, n) : null);
/** Query strings and fragments can carry tokens: keep only origin and path. */
const clean = (v: unknown) => {
  if (typeof v !== "string") return null;
  try { const u = new URL(v); return `${u.origin}${u.pathname}`.slice(0, 160); } catch { return clip(v, 40); }
};

/**
 * Browsers POST Content-Security-Policy violation reports here (report-uri). Unauthenticated by design,
 * so it is small, rate limited and records only a sanitised summary (no query strings, no page content).
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rl = await rateLimit(`csp:${ip}`, 30, 10 * 60 * 1000, { failure: "degraded" });
  if (!rl.ok) return new NextResponse(null, { status: 204 });
  const len = Number(req.headers.get("content-length"));
  if (!Number.isFinite(len) || len > MAX_BYTES) return new NextResponse(null, { status: 204 });
  let body: unknown;
  try { body = JSON.parse(await req.text()); } catch { return new NextResponse(null, { status: 204 }); }

  const r = (body as { "csp-report"?: Record<string, unknown> })?.["csp-report"] ?? (Array.isArray(body) ? (body[0] as { body?: Record<string, unknown> })?.body : undefined);
  if (r && typeof r === "object") {
    await logSecurityEvent("csp_violation", {
      severity: "info",
      ip,
      detail: {
        directive: clip(r["violated-directive"] ?? r["effectiveDirective"], 60),
        blocked: clean(r["blocked-uri"] ?? r["blockedURL"]),
        page: clean(r["document-uri"] ?? r["documentURL"]),
        disposition: clip(r["disposition"], 20),
      },
    });
  }
  return new NextResponse(null, { status: 204 });
}
