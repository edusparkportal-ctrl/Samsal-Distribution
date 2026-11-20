import { NextResponse } from "next/server";
import { issueToken, tokenEnabled } from "@/lib/form-token";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues a signed "form opened at" token.
 * In production a missing FORM_TOKEN_SECRET is an error (503), not an empty token: the submit route refuses
 * to accept forms without a valid token, so failing here makes the problem visible immediately.
 */
export async function GET(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!tokenEnabled()) {
    if (process.env.NODE_ENV === "production") {
      console.error("[quote token] FORM_TOKEN_SECRET is not configured.");
      return NextResponse.json({ token: "" }, { status: 503, headers });
    }
    return NextResponse.json({ token: "" }, { headers });
  }
  // Cheap to call, so keep scraping in check. A per-instance fallback applies if the shared store is down.
  const rl = await rateLimit(`qtoken:${clientIp(req.headers)}`, 60, 10 * 60 * 1000, { failure: "degraded" });
  if (!rl.ok) return NextResponse.json({ token: "" }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfter) } });
  return NextResponse.json({ token: issueToken() }, { headers });
}
