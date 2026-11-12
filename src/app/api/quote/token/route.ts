import { NextResponse } from "next/server";
import { issueToken, tokenEnabled } from "@/lib/form-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issues a signed "form opened at" token. Returns an empty token if signing is not configured. */
export async function GET() {
  return NextResponse.json(
    { token: tokenEnabled() ? issueToken() : "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
