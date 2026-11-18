"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";

const PATH = "/admin/people/me";
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

async function ready() {
  const auth = await checkPermission("people.self", "people");
  if (!auth.ok) flash(PATH, "error", auth.error);
  return createSupabaseServerClient();
}

export async function clockIn() {
  const sb = await ready();
  const { data, error } = await sb.rpc("clock_in");
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", data === "late" ? "Checked in (recorded as late)." : "Checked in. Have a good day.");
}

export async function clockOut() {
  const sb = await ready();
  const { error } = await sb.rpc("clock_out");
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Checked out.");
}

export async function requestLeave(formData: FormData) {
  const sb = await ready();
  const type = str(formData, "leave_type_id", 40);
  const start = str(formData, "start_date", 10);
  const end = str(formData, "end_date", 10);
  if (!isUuid(type) || !isDate(start) || !isDate(end)) flash(PATH, "error", "Choose the leave type and both dates.");
  if (end < start) flash(PATH, "error", "The end date cannot be before the start date.");
  const { data: me } = await sb.rpc("my_employee_id");
  if (!me) flash(PATH, "error", "No employee record is linked to your account. Ask HR.");
  // The database counts working days, checks overlaps and the yearly allowance, and opens the approval request.
  const { error } = await sb.from("leave_requests").insert({ employee_id: me, leave_type_id: type, start_date: start, end_date: end, reason: optStr(formData, "reason", 1000) });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Leave requested. Your approver has been notified.");
}

export async function cancelLeave(formData: FormData) {
  const sb = await ready();
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(PATH, "error", "Invalid request.");
  const { error } = await sb.rpc("cancel_leave_request", { p_id: id });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Leave cancelled.");
}

export async function acknowledgeReview(formData: FormData) {
  const sb = await ready();
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(PATH, "error", "Invalid review.");
  const { error } = await sb.rpc("acknowledge_review", { p_id: id });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Thank you. The review is marked as read.");
}
