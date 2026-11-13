"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
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
