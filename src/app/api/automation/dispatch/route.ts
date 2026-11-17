import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatchOutbox, runSchedulerTick } from "@/lib/automation/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called by the platform scheduler (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`).
 * Runs due automations (a safety net beside pg_cron) and then sends queued emails.
 * Without a correct CRON_SECRET it does nothing and reveals nothing.
 */
function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorised(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const tick = await runSchedulerTick();
  const mail = await dispatchOutbox();
  return NextResponse.json({ ok: tick.ok && mail.ok, tick, mail }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
