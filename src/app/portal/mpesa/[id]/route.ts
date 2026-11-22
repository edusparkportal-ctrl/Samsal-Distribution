import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import { rateLimit } from "@/lib/rate-limit";
import { reconcile } from "@/lib/mpesa/daraja";
import { checkoutIdOf, completeViaDb, getMpesaConfig } from "@/lib/mpesa/service";
import type { MpesaStatus } from "@/lib/portal/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Status of ONE of the caller's own payment requests. Ownership is decided by the database (portal_mpesa_status
 * returns nothing for anyone else's). If the callback has not arrived after 45 seconds, we ask Safaricom ourselves,
 * at most once every 20 seconds; the result is applied by the same idempotent database function as the callback.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const read = async () => (await supabase.rpc("portal_mpesa_status", { p_id: id })).data as MpesaStatus | null;
  let s = await read();
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const cfg = getMpesaConfig();
  if (cfg && s.status === "pending" && s.age >= 45) {
    const rl = await rateLimit(`pmpesa-q:${id}`, 1, 20_000, { failure: "degraded" });
    if (rl.ok) {
      const checkout = await checkoutIdOf(id);
      if (checkout) { await reconcile(checkout, { cfg, fetch: (u, i) => fetch(u, i as RequestInit), complete: completeViaDb }); s = (await read()) ?? s; }
    }
  }
  return NextResponse.json({ status: s.status, receipt: s.receipt, message: s.message }, { headers: { "Cache-Control": "no-store" } });
}
