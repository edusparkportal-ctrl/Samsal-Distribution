import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isPermission, type Permission } from "@/lib/auth/permissions";
import type { ModuleKey } from "@/lib/modules";

export type StaffContext = {
  userId: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  roleKey: string;
  roleName: string;
  isSuper: boolean;
  permissions: ReadonlySet<Permission>;
  modules: Readonly<Record<string, boolean>>;
  has: (p: Permission) => boolean;
  moduleEnabled: (k: ModuleKey) => boolean;
};

export type SessionState =
  | { status: "unconfigured" }
  | { status: "anonymous" }
  | { status: "pending"; email: string } // signed in but no role / not activated
  | { status: "ok"; ctx: StaffContext };

/**
 * Resolves who is calling, from the verified Supabase session. Cached per request.
 * The role/permission data comes from the database (RPC my_permissions), never from the browser.
 */
export const getSession = cache(async (): Promise<SessionState> => {
  if (!isSupabaseConfigured()) return { status: "unconfigured" };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "anonymous" };

  const [{ data: profile }, { data: perms }, { data: mods }] = await Promise.all([
    supabase.from("profiles").select("full_name, job_title, is_active, role:roles(key, name, is_super)").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_permissions"),
    supabase.from("modules").select("key, enabled"),
  ]);

  const role = Array.isArray(profile?.role) ? profile?.role[0] : profile?.role;
  if (!profile || !profile.is_active || !role) return { status: "pending", email: user.email ?? "" };

  const permissions = new Set<Permission>(((perms as string[] | null) ?? []).filter(isPermission));
  const modules: Record<string, boolean> = {};
  (mods ?? []).forEach((m: { key: string; enabled: boolean }) => (modules[m.key] = m.enabled));

  return {
    status: "ok",
    ctx: {
      userId: user.id,
      email: user.email ?? "",
      fullName: profile.full_name || user.email || "",
      jobTitle: profile.job_title ?? null,
      roleKey: role.key,
      roleName: role.name,
      isSuper: role.is_super,
      permissions,
      modules,
      has: (p) => permissions.has(p),
      moduleEnabled: (k) => modules[k] === true,
    },
  };
});

/** For pages: redirects anonymous visitors to the login page. */
export async function requireStaff(): Promise<StaffContext> {
  const s = await getSession();
  if (s.status === "ok") return s.ctx;
  if (s.status === "pending") redirect("/admin/login?reason=pending");
  redirect("/admin/login");
}

/**
 * For pages and server actions: the user must hold the permission AND (optionally) the module must
 * be enabled. Pages redirect to a 403 view; use checkPermission() inside actions to return an error instead.
 */
export async function requirePermission(permission: Permission, module?: ModuleKey): Promise<StaffContext> {
  const ctx = await requireStaff();
  if (!ctx.has(permission) && !ctx.isSuper) redirect("/admin/forbidden");
  if (module && !ctx.moduleEnabled(module)) redirect("/admin/forbidden?reason=module");
  return ctx;
}

/** Non-redirecting variant for server actions. */
export async function checkPermission(
  permission: Permission,
  module?: ModuleKey,
): Promise<{ ok: true; ctx: StaffContext } | { ok: false; error: string }> {
  const s = await getSession();
  if (s.status !== "ok") return { ok: false, error: "Your session has expired. Please sign in again." };
  const ctx = s.ctx;
  if (!ctx.has(permission) && !ctx.isSuper) return { ok: false, error: "You do not have permission to do that." };
  if (module && !ctx.moduleEnabled(module)) return { ok: false, error: "That module is switched off." };
  return { ok: true, ctx };
}
