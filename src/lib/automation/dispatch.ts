import "server-only";
import { createServiceClient, isServiceClientConfigured } from "@/lib/supabase/admin";

/**
 * Sends the emails that automations have queued in public.notification_outbox, using Resend.
 *
 * Safety rules:
 *  - Nothing is claimed or sent unless the global "email automation" switch is ON in the Control Centre
 *    AND RESEND_API_KEY and AUTOMATION_FROM_EMAIL are configured. Until a sending domain is verified the
 *    switch stays off, so no queued email can leave by accident.
 *  - Each email is claimed with FOR UPDATE SKIP LOCKED, so two dispatchers never send the same email.
 *  - A failed send is retried with back-off (5, 10, 20... minutes) up to max_attempts, then reported to
 *    administrators. Provider errors are stored in the outbox row, never thrown.
 */
export type DispatchResult =
  | { ok: true; sent: number; failed: number; skipped?: undefined }
  | { ok: true; sent: 0; failed: 0; skipped: "email_off" | "not_configured" | "database_off" }
  | { ok: false; error: string };

type OutboxRow = { id: string; to_email: string; subject: string; body: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function dispatchOutbox(limit = 20): Promise<DispatchResult> {
  if (!isServiceClientConfigured()) return { ok: true, sent: 0, failed: 0, skipped: "database_off" };
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTOMATION_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { ok: true, sent: 0, failed: 0, skipped: "not_configured" };

  try {
    const sb = createServiceClient();
    const { data: settings } = await sb.from("automation_settings").select("email_enabled").eq("id", 1).maybeSingle();
    if (!settings?.email_enabled) return { ok: true, sent: 0, failed: 0, skipped: "email_off" };

    const { data, error } = await sb.rpc("outbox_claim", { p_limit: limit });
    if (error) return { ok: false, error: error.message };
    const rows = (data ?? []) as OutboxRow[];
    let sent = 0;
    let failed = 0;
    const replyTo = process.env.QUOTE_TO_EMAIL?.trim();

    for (const row of rows) {
      let okSend = false;
      let err = "";
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `outbox-${row.id}` },
          body: JSON.stringify({
            from,
            to: [row.to_email],
            subject: row.subject,
            text: row.body,
            html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;white-space:pre-wrap">${esc(row.body)}</div>`,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        });
        okSend = res.ok;
        if (!res.ok) err = `Provider returned ${res.status}: ${(await res.text()).slice(0, 200)}`;
      } catch (e) {
        err = e instanceof Error ? e.message : "Network error";
      }
      const done = await sb.rpc("outbox_complete", { p_id: row.id, p_ok: okSend, p_error: okSend ? null : err });
      if (done.error) console.error("[automation] outbox_complete failed", done.error.message);
      if (okSend) sent += 1;
      else failed += 1;
    }
    return { ok: true, sent, failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Dispatch failed" };
  }
}

/** Runs the scheduler tick from the application (a safety net for when pg_cron is not available). */
export async function runSchedulerTick(): Promise<{ ok: boolean; items?: number; error?: string }> {
  if (!isServiceClientConfigured()) return { ok: false, error: "Database not configured" };
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc("run_automations");
    if (error) return { ok: false, error: error.message };
    return { ok: true, items: typeof data === "number" ? data : 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tick failed" };
  }
}
