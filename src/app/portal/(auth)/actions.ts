"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceClientConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/captcha";
import { safePortalNext } from "@/lib/auth/safe-redirect";
import { site } from "@/config/site";
import { clientIp } from "@/lib/security/request";
import { logSecurityEvent } from "@/lib/security/events";
import { parseRegistration, passwordProblem } from "@/lib/portal/validation";

export type PortalAuthState = { error?: string; message?: string };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const WAIT = "Too many attempts. Please wait a few minutes and try again.";

export async function portalSignIn(_prev: PortalAuthState, formData: FormData): Promise<PortalAuthState> {
  if (!isSupabaseConfigured()) return { error: "Sign-in is not available yet." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const next = safePortalNext(String(formData.get("next") ?? ""));
  if (!EMAIL_RE.test(email) || !password) return { error: "Enter your email address and password." };

  const ip = clientIp(await headers());
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`plogin:ip:${ip}`, 15, 10 * 60 * 1000, { failure: "degraded" }),
    rateLimit(`plogin:email:${email}`, 6, 15 * 60 * 1000, { failure: "degraded" }),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    await logSecurityEvent("ratelimit_block", { severity: "warning", ip, detail: { where: "portal_login", scope: byIp.ok ? "account" : "ip" } });
    return { error: WAIT };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await logSecurityEvent("login_failed", { severity: "warning", ip, detail: { reason: "bad_credentials", area: "portal" } });
    return { error: "Invalid email or password." };
  }
  await logSecurityEvent("login_ok", { actor: data.user.id, ip, detail: { area: "portal" } });
  redirect(next);
}

/**
 * Registration. Public sign-up stays switched OFF in Supabase (docs/SUPABASE_SETUP.md); instead this server
 * action, protected by CAPTCHA and rate limits that fail closed, sends an INVITATION to the address given.
 * Clicking the link proves the person owns the mailbox and lets them choose a password. The application
 * details travel as invitation metadata; a database trigger turns them into a PENDING application, and
 * nothing is visible to the applicant until staff approve it.
 * The answer is always the same, so the form cannot be used to discover which emails already have accounts.
 */
export async function registerCustomer(_prev: PortalAuthState, formData: FormData): Promise<PortalAuthState> {
  const done: PortalAuthState = { message: "Thank you. If this address can be registered, we have emailed you a link to confirm it and choose a password. After that, our team will review your application." };
  if (!isSupabaseConfigured() || !isServiceClientConfigured()) return { error: "Registration is not available yet. Please contact us." };
  const parsed = parseRegistration(formData);
  if (!parsed.ok) return { error: parsed.error };
  const d = parsed.data;

  const ip = clientIp(await headers());
  const limits = await Promise.all([
    rateLimit(`preg:ip:${ip}`, 5, 60 * 60 * 1000, { failure: "closed" }),
    rateLimit(`preg:email:${d.email}`, 3, 24 * 60 * 60 * 1000, { failure: "closed" }),
  ]);
  if (limits.some((l) => !l.ok)) {
    await logSecurityEvent("ratelimit_block", { severity: "warning", ip, detail: { where: "portal_register" } });
    return { error: limits.some((l) => !l.ok && l.reason !== "limited") ? "Registration is temporarily unavailable. Please try again later." : WAIT };
  }
  const captcha = await verifyTurnstile(String(formData.get("cf-turnstile-response") ?? ""), ip);
  if (!captcha.ok) {
    await logSecurityEvent("captcha_failed", { severity: "warning", ip, detail: { where: "portal_register", reason: captcha.reason } });
    return { error: captcha.reason === "unconfigured" || captcha.reason === "unavailable" ? "Registration is temporarily unavailable. Please try again later." : "Please complete the security check and try again." };
  }

  try {
    const admin = createServiceClient();
    const { data: mod } = await admin.from("modules").select("enabled").eq("key", "portal").maybeSingle();
    if (!mod?.enabled) return { error: "Online registration is not open yet. Please contact us to open a wholesale account." };
    const { error } = await admin.auth.admin.inviteUserByEmail(d.email, {
      redirectTo: `${site.url}/auth/confirm`,
      data: { portal_signup: "true", full_name: d.contactName, company_name: d.companyName, contact_name: d.contactName, phone: d.phone, kra_pin: d.kraPin ?? "", location: d.location ?? "" },
    });
    if (error) console.warn("[portal register] invite not sent:", error.status ?? "", error.code ?? "");
  } catch (e) {
    console.warn("[portal register] failed:", e instanceof Error ? e.name : "error");
    return { error: "Registration is temporarily unavailable. Please try again later." };
  }
  return done;
}

export async function requestPortalReset(_prev: PortalAuthState, formData: FormData): Promise<PortalAuthState> {
  const generic: PortalAuthState = { message: "If that email belongs to a customer account, a reset link has been sent." };
  if (!isSupabaseConfigured()) return { error: "Password reset is not available yet." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  const ip = clientIp(await headers());
  const limited = await Promise.all([rateLimit(`preset:ip:${ip}`, 5, 15 * 60 * 1000, { failure: "degraded" }), rateLimit(`preset:email:${email}`, 3, 60 * 60 * 1000, { failure: "degraded" })]);
  if (limited.some((r) => !r.ok)) return generic;
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site.url}/auth/confirm?next=/portal/set-password` });
  return generic;
}

/** Used after an invitation or password-reset link: the person is signed in and chooses a password. */
export async function setPortalPassword(_prev: PortalAuthState, formData: FormData): Promise<PortalAuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Your link has expired. Please request a new one." };
  // Changing a password from inside the portal needs the current one (an invitation or reset link does not).
  if (formData.get("mode") === "change") {
    const current = String(formData.get("current") ?? "");
    if (!current) return { error: "Enter your current password." };
    const check = await supabase.auth.signInWithPassword({ email: user.email ?? "", password: current });
    if (check.error) return { error: "Your current password is not correct." };
  }
  const problem = passwordProblem(password, user.email ?? "");
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "The two passwords do not match." };
  const rl = await rateLimit(`ppw:${user.id}`, 10, 60 * 60 * 1000, { failure: "degraded" });
  if (!rl.ok) return { error: WAIT };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "We could not save that password. Try a different one." };
  redirect("/portal/status");
}

export async function portalSignOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/portal/login");
}
