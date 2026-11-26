import { NextResponse } from "next/server";
import { webLogo } from "@/lib/brand-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The company logo as set under Website > Company, shrunk for the web. Public (it is on the public site anyway). */
export async function GET() {
  const { body, type } = await webLogo();
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=86400", "X-Content-Type-Options": "nosniff" },
  });
}
