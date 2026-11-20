"use server";

import { revalidatePath } from "next/cache";
import { checkPermission, checkStepUp } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/security/events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceClientConfigured } from "@/lib/supabase/admin";
import { bool, dbError, flash, isUuid, str } from "@/lib/admin/forms";
import { rateLimit } from "@/lib/rate-limit";
import { site } from "@/config/site";

const PATH = "/admin/settings/users";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Invite a staff member by email. They set their own password from the emailed link. */
export async function inviteUser(formData: FormData) {
  const auth = await checkPermission("users.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const ctx = auth.ctx;
  const email = str(formData, "email", 254).toLowerCase();
  const fullName = str(formData, "full_name", 120);
  const roleId = str(formData, "role_id", 40);
  if (!EMAIL_RE.test(email)) flash(PATH, "error", "Enter a valid email address.");
  if (fullName.length < 2) flash(PATH, "error", "Enter the person's full name.");
  if (!isUuid(roleId)) flash(PATH, "error", "Choose a role.");
  if (!isServiceClientConfigured()) flash(PATH, "error", "Inviting users needs SUPABASE_SERVICE_ROLE_KEY to be set on the server (see docs/SUPABASE_SETUP.md).");
  if (!(await rateLimit(`invite:${ctx.userId}`, 20, 60 * 60 * 1000)).ok) flash(PATH, "error", "Too many invitations. Try again later.");

  const service = createServiceClient();
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${site.url}/auth/confirm?next=/admin/account`,
  });
  if (error || !data.user) flash(PATH, "error", "The invitation could not be sent. The email may already have an account.");

  // Assign the role AS THE CALLER so RLS and the database guard triggers decide whether it is allowed
  // (for example, only a Super Administrator can hand out the Super Administrator role).
  const sb = await createSupabaseServerClient();
  const { error: upErr } = await sb.from("profiles").update({ role_id: roleId, is_active: true, full_name: fullName }).eq("id", data!.user!.id);
  revalidatePath(PATH);
  if (upErr) flash(PATH, "error", `Invitation sent, but the role could not be assigned: ${dbError(upErr)} Assign it from the list below.`);
  flash(PATH, "ok", `Invitation sent to ${email}.`);
}

export async function updateUserAccess(formData: FormData) {
  const auth = await checkPermission("users.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const id = str(formData, "id", 40);
  const roleId = str(formData, "role_id", 40);
  if (!isUuid(id) || !isUuid(roleId)) flash(PATH, "error", "Invalid request.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("profiles").update({ role_id: roleId, is_active: bool(formData, "is_active") }).eq("id", id);
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "User access updated.");
}

/**
 * Lost phone? A Super Administrator removes someone's authenticator so they can set up a new one at next sign-in.
 * Needs a fresh code from the administrator, is recorded as a critical security event, and cannot be used on yourself.
 */
export async function resetUserMfa(formData: FormData) {
  const auth = await checkPermission("users.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  if (!auth.ctx.isSuper) flash(PATH, "error", "Only a Super Administrator can reset two-step verification.");
  const step = await checkStepUp();
  if (!step.ok) flash(PATH, "error", step.error);
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(PATH, "error", "Invalid request.");
  if (id === auth.ctx.userId) flash(PATH, "error", "Use My account to manage your own authenticator.");
  if (!isServiceClientConfigured()) flash(PATH, "error", "Resetting needs SUPABASE_SERVICE_ROLE_KEY on the server.");
  const limited = await rateLimit(`mfareset:${auth.ctx.userId}`, 10, 60 * 60 * 1000, { failure: "degraded" });
  if (!limited.ok) flash(PATH, "error", "Too many resets. Try again later.");
  const svc = createServiceClient();
  const { data: list, error } = await svc.auth.admin.mfa.listFactors({ userId: id });
  if (error) flash(PATH, "error", "The authenticators could not be read.");
  let removed = 0;
  for (const f of list?.factors ?? []) {
    const { error: dErr } = await svc.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
    if (!dErr) removed += 1;
  }
  await logSecurityEvent("mfa_reset", { severity: "critical", actor: auth.ctx.userId, detail: { target: id, removed } });
  revalidatePath(PATH);
  flash(PATH, "ok", removed ? "Two-step verification was reset. They will set up a new authenticator at their next sign-in." : "That person had no authenticator to reset.");
}
