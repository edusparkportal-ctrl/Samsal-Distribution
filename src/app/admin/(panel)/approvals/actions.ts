"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, str } from "@/lib/admin/forms";

const PATH = "/admin/approvals";

// The database function decide_approval() is the authority: it checks that this person is an approver for the
// CURRENT step, is not the requester, and has not already decided. Nothing here can bypass that.
export async function decide(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id", 40);
  const decision = str(formData, "decision", 10);
  const comment = str(formData, "comment", 1000);
  if (!isUuid(id) || (decision !== "approved" && decision !== "rejected")) flash(PATH, "error", "Invalid request.");
  if (decision === "rejected" && comment.length < 3) flash(PATH, "error", "Please give a reason when you reject, so the requester knows what to fix.");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("decide_approval", { p_request: id, p_decision: decision, p_comment: comment || null });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", data === "next_step" ? "Approved. It now goes to the next approver." : data === "approved" ? "Approved." : "Rejected. The requester has been told.");
}

export async function cancelRequest(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(PATH, "error", "Invalid request.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cancel_approval", { p_request: id });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Request cancelled.");
}
