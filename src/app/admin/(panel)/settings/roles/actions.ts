"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { isPermission } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";

const PATH = "/admin/settings/roles";

export async function createRole(formData: FormData) {
  const auth = await checkPermission("roles.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const name = str(formData, "name", 80);
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (name.length < 2 || !/^[a-z][a-z0-9_]{1,40}$/.test(key)) flash(PATH, "error", "Enter a role name that starts with a letter (2–80 characters).");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("roles").insert({ key, name, description: optStr(formData, "description", 300) }).select("id").single();
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(`${PATH}?role=${data!.id}`, "ok", "Role created. Now choose its permissions.");
}

export async function saveRolePermissions(formData: FormData) {
  const auth = await checkPermission("roles.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const roleId = str(formData, "role_id", 40);
  if (!isUuid(roleId)) flash(PATH, "error", "Invalid role.");
  // Only keys that exist in code are accepted; anything else submitted is ignored.
  const wanted = new Set(formData.getAll("perm").map(String).filter(isPermission));
  const sb = await createSupabaseServerClient();
  const { data: role } = await sb.from("roles").select("is_super").eq("id", roleId).maybeSingle();
  if (!role) flash(PATH, "error", "That role no longer exists.");
  if (role!.is_super) flash(`${PATH}?role=${roleId}`, "error", "The Super Administrator role always has every permission.");

  const { data: current } = await sb.from("role_permissions").select("permission_key").eq("role_id", roleId);
  const have = new Set((current ?? []).map((r: { permission_key: string }) => r.permission_key));
  const toAdd = [...wanted].filter((k) => !have.has(k));
  const wantedKeys: Set<string> = wanted;
  const toRemove = [...have].filter((k) => !wantedKeys.has(k));
  if (toAdd.length) {
    const { error } = await sb.from("role_permissions").insert(toAdd.map((permission_key) => ({ role_id: roleId, permission_key })));
    if (error) flash(`${PATH}?role=${roleId}`, "error", dbError(error));
  }
  if (toRemove.length) {
    const { error } = await sb.from("role_permissions").delete().eq("role_id", roleId).in("permission_key", toRemove);
    if (error) flash(`${PATH}?role=${roleId}`, "error", dbError(error));
  }
  revalidatePath(PATH);
  flash(`${PATH}?role=${roleId}`, "ok", `Permissions saved (${toAdd.length} added, ${toRemove.length} removed).`);
}

export async function deleteRole(formData: FormData) {
  const auth = await checkPermission("roles.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const roleId = str(formData, "role_id", 40);
  if (!isUuid(roleId)) flash(PATH, "error", "Invalid role.");
  const sb = await createSupabaseServerClient();
  const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("role_id", roleId);
  if ((count ?? 0) > 0) flash(`${PATH}?role=${roleId}`, "error", `${count} user(s) still have this role. Move them to another role first.`);
  const { error } = await sb.from("roles").delete().eq("id", roleId);
  if (error) flash(`${PATH}?role=${roleId}`, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Role deleted.");
}
