import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness and database reachability for uptime monitors. Public, so it reveals nothing about configuration:
 * only "ok" and whether the database answered. (Configuration checks live on the signed-in security page.)
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, database: "not_configured" }, { headers });
  try {
    const sb = await createSupabaseServerClient();
    const { error } = await sb.from("company_settings").select("*", { head: true, count: "exact" }).limit(1);
    return NextResponse.json({ ok: !error, database: error ? "unavailable" : "ok" }, { status: error ? 503 : 200, headers });
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503, headers });
  }
}
