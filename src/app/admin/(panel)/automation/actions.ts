"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bool, dbError, flash, isUuid, str } from "@/lib/admin/forms";
import { dispatchOutbox } from "@/lib/automation/dispatch";

const PATH = "/admin/automation";
const KEY_RE = /^[a-z][a-z0-9_]{2,60}$/;

/** Switch, schedule, settings and channels of one automation. Numbers only; the database re-validates. */
export async function saveRule(formData: FormData) {
  const auth = await checkPermission("automation.manage", "automation");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const key = str(formData, "key", 64);
  if (!KEY_RE.test(key)) flash(PATH, "error", "Unknown automation.");

  const sb = await createSupabaseServerClient();
  const { data: rule } = await sb.from("automation_rules").select("key, kind, params, email_capable").eq("key", key).maybeSingle();
  if (!rule) flash(PATH, "error", "Unknown automation.");

  const update: Record<string, unknown> = {
    enabled: bool(formData, "enabled"),
    notify_in_app: bool(formData, "notify_in_app"),
    updated_by: auth.ok ? auth.ctx.userId : null,
  };
  if (rule?.email_capable) update.notify_email = bool(formData, "notify_email");
  if (rule?.kind === "scheduled") {
    const mins = Number.parseInt(String(formData.get("schedule_minutes") ?? ""), 10);
    if (!Number.isFinite(mins) || mins < 5 || mins > 10080) flash(PATH, "error", "The schedule must be between 5 minutes and 7 days.");
    update.schedule_minutes = mins;
  }
  const params: Record<string, number> = {};
  for (const name of Object.keys((rule?.params ?? {}) as Record<string, number>)) {
    const n = Number(String(formData.get(`p_${name}`) ?? "").trim());
    if (!Number.isFinite(n) || n < 0 || n > 100000) flash(PATH, "error", `"${name}" must be a number.`);
    params[name] = n;
  }
  if (Object.keys(params).length > 0) update.params = params;

  const { error } = await sb.from("automation_rules").update(update).eq("key", key);
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Automation saved.");
}

export async function setEmailEnabled(formData: FormData) {
  const auth = await checkPermission("automation.manage", "automation");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("automation_settings").update({ email_enabled: bool(formData, "enabled") }).eq("id", 1);
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", bool(formData, "enabled") ? "Email automation switched on." : "Email automation switched off.");
}

export async function runNow(formData: FormData) {
  const auth = await checkPermission("automation.manage", "automation");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const key = str(formData, "key", 64);
  if (!KEY_RE.test(key)) flash(PATH, "error", "Unknown automation.");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("run_automation_now", { p_key: key });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", `Ran now: ${typeof data === "number" ? data : 0} notification(s) created. See the run log for details.`);
}

export async function dispatchNow() {
  const auth = await checkPermission("automation.manage", "automation");
  if (!auth.ok) flash("/admin/automation/outbox", "error", auth.error);
  const r = await dispatchOutbox(25);
  revalidatePath("/admin/automation/outbox");
  if (!r.ok) flash("/admin/automation/outbox", "error", "Sending failed: " + r.error.slice(0, 200));
  if (r.skipped === "email_off") flash("/admin/automation/outbox", "error", "Email automation is switched off in the Control Centre.");
  if (r.skipped === "not_configured") flash("/admin/automation/outbox", "error", "Email sending is not configured yet (RESEND_API_KEY and AUTOMATION_FROM_EMAIL are missing).");
  if (r.skipped === "database_off") flash("/admin/automation/outbox", "error", "The database service key is not configured.");
  flash("/admin/automation/outbox", "ok", `Sent ${r.sent}, failed ${r.failed}.`);
}

export async function retryOutbox(formData: FormData) {
  const auth = await checkPermission("automation.manage", "automation");
  if (!auth.ok) flash("/admin/automation/outbox", "error", auth.error);
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash("/admin/automation/outbox", "error", "Invalid email.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("retry_outbox", { p_id: id });
  if (error) flash("/admin/automation/outbox", "error", dbError(error));
  revalidatePath("/admin/automation/outbox");
  flash("/admin/automation/outbox", "ok", "Queued for another attempt.");
}
