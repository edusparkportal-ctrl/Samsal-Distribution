"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";

const PATH = "/admin/people/payroll";
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const run = (id: string) => `${PATH}?run=${id}`;

// This system only RECORDS payroll. It never pays anyone. Every status change below goes through a database
// function that checks the person's permission and the approval state; the browser cannot set a status.

export async function createRun(formData: FormData) {
  const auth = await checkPermission("people.payroll_prepare", "people");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const start = str(formData, "period_start", 10);
  const end = str(formData, "period_end", 10);
  if (!isDate(start) || !isDate(end) || end < start) flash(PATH, "error", "Enter a valid pay period.");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("payroll_runs").insert({ period_start: start, period_end: end, currency: str(formData, "currency", 3).toUpperCase() || "KES", notes: optStr(formData, "notes", 1000) }).select("id").single();
  if (error) flash(PATH, "error", error.code === "23505" ? "A payroll run for that period already exists." : dbError(error));
  revalidatePath(PATH);
  flash(run((data as { id: string }).id), "ok", "Payroll run started. Fill it from salary records next.");
}

export async function generateLines(formData: FormData) {
  const id = str(formData, "id", 40);
  const auth = await checkPermission("people.payroll_prepare", "people");
  if (!auth.ok || !isUuid(id)) flash(PATH, "error", auth.ok ? "Invalid run." : auth.error);
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("payroll_generate_lines", { p_run: id });
  if (error) flash(run(id), "error", dbError(error));
  revalidatePath(PATH);
  flash(run(id), "ok", `${data ?? 0} line(s) added from salary records. Enter each person's deductions yourself.`);
}

export async function saveLines(formData: FormData) {
  const id = str(formData, "id", 40);
  const auth = await checkPermission("people.payroll_prepare", "people");
  if (!auth.ok || !isUuid(id)) flash(PATH, "error", auth.ok ? "Invalid run." : auth.error);
  const sb = await createSupabaseServerClient();
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("ded_") || typeof v !== "string") continue;
    const lineId = k.slice(4);
    const n = Number(v.trim() === "" ? 0 : v);
    if (!isUuid(lineId) || !Number.isFinite(n) || n < 0) flash(run(id), "error", "Deductions must be numbers of zero or more.");
    const note = str(formData, `note_${lineId}`, 500) || null;
    const { error } = await sb.from("payroll_lines").update({ deductions: n, note }).eq("id", lineId).eq("run_id", id);
    if (error) flash(run(id), "error", error.code === "23514" ? "Deductions cannot be more than gross pay." : dbError(error));
  }
  revalidatePath(PATH);
  flash(run(id), "ok", "Saved.");
}

export async function removeLine(formData: FormData) {
  const id = str(formData, "id", 40);
  const lineId = str(formData, "line", 40);
  const auth = await checkPermission("people.payroll_prepare", "people");
  if (!auth.ok || !isUuid(id) || !isUuid(lineId)) flash(PATH, "error", auth.ok ? "Invalid line." : auth.error);
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("payroll_lines").delete().eq("id", lineId).eq("run_id", id);
  if (error) flash(run(id), "error", dbError(error));
  revalidatePath(PATH);
  flash(run(id), "ok", "Line removed.");
}

export async function submitRun(formData: FormData) {
  const id = str(formData, "id", 40);
  const auth = await checkPermission("people.payroll_prepare", "people");
  if (!auth.ok || !isUuid(id)) flash(PATH, "error", auth.ok ? "Invalid run." : auth.error);
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("submit_payroll_run", { p_run: id });
  if (error) flash(run(id), "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(run(id), "ok", "Submitted. HR and then Finance approvers must approve it before it can be recorded as paid.");
}

export async function recordPaid(formData: FormData) {
  const id = str(formData, "id", 40);
  const auth = await checkPermission("finance.payroll_approve", "finance");
  if (!auth.ok || !isUuid(id)) flash(PATH, "error", auth.ok ? "Invalid run." : auth.error);
  const paidOn = str(formData, "paid_on", 10);
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("record_payroll_paid", { p_run: id, p_reference: str(formData, "reference", 120), p_paid_on: isDate(paidOn) ? paidOn : null });
  if (error) flash(run(id), "error", dbError(error));
  revalidatePath(PATH);
  flash(run(id), "ok", "Recorded as paid. Remember: the payment itself is made outside this system.");
}
