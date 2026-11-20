import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isPermission, type Permission } from "@/lib/auth/permissions";
import type { ModuleKey } from "@/lib/modules";
import { MFA_MARKER, STEP_UP_MAX_AGE_SECONDS, assuranceFromClaims, decodeJwtClaims, isRecentMfa } from "@/lib/security/mfa";

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
  /** Second-factor state of this session (see lib/security/mfa.ts). */
  mfa: { required: boolean; enrolled: boolean; aal: "aal1" | "aal2"; recent: boolean };
};

export type SessionState =
  | { status: "unconfigured" }
  | { status: "anonymous" }
  | { status: "pending"; email: string } // signed in but no role / not activated
  | { status: "mfa_verify" } // signed in with a password; must enter an authenticator code
  | { status: "mfa_enroll" } // role requires MFA but no authenticator is set up yet
  | { status: "security_setup" } // the database security update has not been applied: fail closed
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

  // ---- Multi-factor gate (also enforced by the database: a role that requires MFA has no data access at aal1) ----
  const [mfaReq, aalRes, sessionRes] = await Promise.all([
    supabase.rpc("my_mfa_required"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.getSession(),
  ]);
  if (mfaReq.error) return { status: "security_setup" }; // unknown -> closed (e.g. migration not applied yet)
  const required = mfaReq.data === true;
  const enrolled = (user.factors ?? []).some((f) => f.status === "verified");
  const currentAal = aalRes.data?.currentLevel === "aal2" ? "aal2" : "aal1";
  if (currentAal !== "aal2") {
    if (enrolled) return { status: "mfa_verify" };
    if (required) return { status: "mfa_enroll" };
  }
  const assurance = assuranceFromClaims(decodeJwtClaims(sessionRes.data.session?.access_token));

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
      mfa: { required, enrolled, aal: assurance.aal, recent: isRecentMfa(assurance, STEP_UP_MAX_AGE_SECONDS) },
    },
  };
});

/** For pages: redirects anonymous visitors to the login page. */
export async function requireStaff(): Promise<StaffContext> {
  const s = await getSession();
  if (s.status === "ok") return s.ctx;
  if (s.status === "pending") redirect("/admin/login?reason=pending");
  if (s.status === "mfa_verify") redirect("/admin/mfa/verify");
  if (s.status === "mfa_enroll") redirect("/admin/mfa/setup");
  if (s.status === "security_setup") redirect("/admin/login?reason=security_setup");
  redirect("/admin/login");
}

/**
 * For pages and routes that open or export sensitive data: needs a second-factor check in the last 15 minutes.
 * Sends the person to the verification page (or to set up an authenticator first) and brings them back.
 */
export async function requireStepUp(returnTo: string): Promise<StaffContext> {
  const ctx = await requireStaff();
  if (ctx.mfa.recent) return ctx;
  const next = encodeURIComponent(returnTo.startsWith("/admin") ? returnTo : "/admin");
  redirect(ctx.mfa.enrolled ? `/admin/mfa/verify?next=${next}&fresh=1` : `/admin/mfa/setup?next=${next}`);
}

/** Non-redirecting variant for server actions. The message starts with the MFA marker so the page can offer a "Verify now" link. */
export async function checkStepUp(): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await getSession();
  if (s.status !== "ok") return { ok: false, error: "Your session has expired. Please sign in again." };
  if (s.ctx.mfa.recent) return { ok: true };
  return { ok: false, error: `${MFA_MARKER} This action needs a fresh authenticator code. Verify now, then repeat it.` };
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
  if (s.status === "mfa_verify" || s.status === "mfa_enroll") return { ok: false, error: `${MFA_MARKER} Multi-factor verification is required before you can continue.` };
  if (s.status !== "ok") return { ok: false, error: "Your session has expired. Please sign in again." };
  const ctx = s.ctx;
  if (!ctx.has(permission) && !ctx.isSuper) return { ok: false, error: "You do not have permission to do that." };
  if (module && !ctx.moduleEnabled(module)) return { ok: false, error: "That module is switched off." };
  return { ok: true, ctx };
}
