"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/auth/safe-redirect";
import { site } from "@/config/site";
import { clientIp as ipFrom } from "@/lib/security/request";
import { logSecurityEvent } from "@/lib/security/events";

export type AuthState = { error?: string; message?: string };

async function clientIp() {
  return ipFrom(await headers());
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { error: "Sign-in is not available yet: Supabase has not been configured." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!EMAIL_RE.test(email) || !password) return { error: "Enter your email address and password." };

  // Throttle by IP and by account so passwords cannot be guessed in bulk.
  // "degraded": if the shared store is down, a stricter per-instance limit applies instead of locking staff out.
  const ip = await clientIp();
  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 15, 10 * 60 * 1000, { failure: "degraded" }),
    rateLimit(`login:email:${email}`, 6, 15 * 60 * 1000, { failure: "degraded" }),
  ]);
  if (!byIp.ok || !byEmail.ok) {
    await logSecurityEvent("ratelimit_block", { severity: "warning", ip, detail: { where: "login", scope: byIp.ok ? "account" : "ip" } });
    return { error: "Too many sign-in attempts. Please wait a few minutes and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // One generic message: never reveal whether the email exists.
  if (error || !data.user) {
    await logSecurityEvent("login_failed", { severity: "warning", ip, detail: { reason: "bad_credentials" } });
    return { error: "Invalid email or password." };
  }

  const { data: profile } = await supabase.from("profiles").select("is_active, role_id").eq("id", data.user.id).maybeSingle();
  if (!profile?.is_active || !profile.role_id) {
    await supabase.auth.signOut();
    return { error: "Your account has not been activated yet. Ask a Super Administrator to give you access." };
  }
  await supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
  await logSecurityEvent("login_ok", { actor: data.user.id, ip });
  // A password alone is not enough when an authenticator is set up: go straight to the code step.
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.data?.nextLevel === "aal2" && aal.data.currentLevel !== "aal2") redirect(`/admin/mfa/verify?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const generic: AuthState = { message: "If that email belongs to a staff account, a reset link has been sent." };
  if (!isSupabaseConfigured()) return { error: "Password reset is not available yet: Supabase has not been configured." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  const limited = await Promise.all([rateLimit(`reset:ip:${await clientIp()}`, 5, 15 * 60 * 1000), rateLimit(`reset:email:${email}`, 3, 60 * 60 * 1000)]);
  if (limited.some((r) => !r.ok)) return generic; // do not reveal throttling either
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site.url}/auth/confirm?next=/admin/account` });
  return generic;
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}
