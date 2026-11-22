import { NextResponse } from "next/server";
import { processCallback, tokenMatches } from "@/lib/mpesa/daraja";
import { completeViaDb, getMpesaConfig } from "@/lib/mpesa/service";
import { logSecurityEvent } from "@/lib/security/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACK = { ResultCode: 0, ResultDesc: "Accepted" };

/**
 * Safaricom posts the payment result here. Protection, in order:
 *  1. the secret token in the path (anything else gets a plain 404, revealing nothing),
 *  2. a small body limit and strict parsing,
 *  3. a "success" is credited only after Safaricom confirms it through our own STK Query,
 *  4. the database applies a result exactly once (see mpesa_complete).
 * Always answers 200 for authentic calls so Safaricom does not retry.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cfg = getMpesaConfig();
  if (!cfg || !tokenMatches(token, cfg.callbackToken)) {
    if (cfg) await logSecurityEvent("token_failed", { severity: "warning", detail: { where: "mpesa_callback" } });
    return new NextResponse("Not found", { status: 404 });
  }
  const raw = await req.text();
  if (raw.length > 20_000) return NextResponse.json(ACK);
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { /* ignored below */ }
  await processCallback(body, { cfg, fetch: (u, i) => fetch(u, i as RequestInit), complete: completeViaDb });
  return NextResponse.json(ACK);
}
