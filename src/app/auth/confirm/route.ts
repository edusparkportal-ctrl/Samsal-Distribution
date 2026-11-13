import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/auth/safe-redirect";

/**
 * Target of the links in Supabase invitation / password-reset emails:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite|recovery|email
 * Verifies the one-time token, starts a session, then sends the user to set a password.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), "/admin/account");
  const fail = NextResponse.redirect(new URL("/admin/login?error=link", request.url));

  if (!isSupabaseConfigured() || !tokenHash || !type) return fail;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail;
  const res = NextResponse.redirect(new URL(next, request.url));
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
