import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal/session";
import { TEMPLATE_CSV } from "@/lib/portal/csv";

export const dynamic = "force-dynamic";

/** A sample file for customers to fill in. */
export async function GET() {
  const s = await getPortalSession();
  if (s.status !== "ok") return new NextResponse("Not available", { status: 403 });
  return new NextResponse(TEMPLATE_CSV, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="samsal-bulk-order-template.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
