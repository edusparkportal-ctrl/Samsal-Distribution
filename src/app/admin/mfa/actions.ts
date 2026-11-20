"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/auth/safe-redirect";
import { clientIp } from "@/lib/security/request";
import { logSecurityEvent } from "@/lib/security/events";
import { TOTP_CODE_RE } from "@/lib/security/mfa";

export type MfaState = { error?: string; message?: string };
export type EnrolStart = { error?: string; factorId?: string; qr?: string; secret?: string };

const code = (fd: FormData) => String(fd.get("code") ?? "").replace(/\s+/g, "").slice(0, 12);

async function signedInUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/** Second step of sign-in, and the "verify now" step-up for sensitive actions. */
export async function verifyMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const { supabase, user } = await signedInUser();
  if (!user) redirect("/admin/login");
  const next = safeNext(String(formData.get("next") ?? ""));
  const c = code(formData);
  if (!TOTP_CODE_RE.test(c)) return { error: "Enter the 6-digit code from your authenticator app." };

  const ip = clientIp(await headers());
  const [byUser, byIp] = await Promise.all([
    rateLimit(`mfa:user:${user.id}`, 6, 10 * 60 * 1000, { failure: "degraded" }),
    rateLimit(`mfa:ip:${ip}`, 20, 10 * 60 * 1000, { failure: "degraded" }),
  ]);
  if (!byUser.ok || !byIp.ok) {
    await logSecurityEvent("ratelimit_block", { severity: "warning", actor: user.id, ip, detail: { where: "mfa_verify" } });
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified");
  if (!totp) redirect(`/admin/mfa/setup?next=${encodeURIComponent(next)}`);

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: c });
  if (error) {
    await logSecurityEvent("mfa_failed", { severity: "warning", actor: user.id, ip, detail: { where: "verify" } });
    return { error: "That code was not accepted. Check the time on your phone and try the newest code." };
  }
  redirect(next);
}

/** Step 1 of enrolment: creates an (unverified) authenticator and returns the QR code and manual key. */
export async function startEnrol(): Promise<EnrolStart> {
  const { supabase, user } = await signedInUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };
  const ip = clientIp(await headers());
  const r = await rateLimit(`mfa:enrol:${user.id}`, 8, 60 * 60 * 1000, { failure: "degraded" });
  if (!r.ok) return { error: "Too many attempts. Please wait and try again." };

  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.data?.nextLevel === "aal2" && aal.data.currentLevel !== "aal2") return { error: "Verify your existing authenticator before adding another." };

  // Remove abandoned, never-verified attempts so they do not pile up.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "SAMSAL Admin", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)} ${Math.random().toString(36).slice(2, 6)}` });
  if (error || !data) {
    await logSecurityEvent("config_missing", { severity: "warning", actor: user.id, ip, detail: { where: "mfa_enrol", code: error?.code ?? "unknown" } });
    return { error: "Could not start setup. Multi-factor authentication (TOTP) must be enabled in the Supabase project (Authentication, Multi-Factor). Ask the person who manages the system." };
  }
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Step 2: the person types the first code to prove the authenticator works. */
export async function confirmEnrol(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const { supabase, user } = await signedInUser();
  if (!user) redirect("/admin/login");
  const factorId = String(formData.get("factorId") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const c = code(formData);
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) return { error: "Start the setup again." };
  if (!TOTP_CODE_RE.test(c)) return { error: "Enter the 6-digit code from your authenticator app." };
  const ip = clientIp(await headers());
  const r = await rateLimit(`mfa:user:${user.id}`, 6, 10 * 60 * 1000, { failure: "degraded" });
  if (!r.ok) return { error: "Too many attempts. Wait a few minutes and try again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: c });
  if (error) {
    await logSecurityEvent("mfa_failed", { severity: "warning", actor: user.id, ip, detail: { where: "enrol" } });
    return { error: "That code was not accepted. Check the time on your phone and try the newest code." };
  }
  await logSecurityEvent("mfa_enrolled", { actor: user.id, ip });
  redirect(next === "/admin" ? "/admin/account?ok=Authenticator%20added" : next);
}

export async function cancelEnrol(): Promise<void> {
  const { supabase, user } = await signedInUser();
  if (!user) return;
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
}
