"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/session";
import { dbError, flash, optStr, str } from "@/lib/admin/forms";

const PATH = "/admin/account";

export async function updateProfile(formData: FormData) {
  const ctx = await requireStaff();
  const fullName = str(formData, "full_name", 120);
  if (fullName.length < 2) flash(PATH, "error", "Enter your full name.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("profiles").update({ full_name: fullName, phone: optStr(formData, "phone", 40), job_title: optStr(formData, "job_title", 80) }).eq("id", ctx.userId);
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Profile updated.");
}

export async function changePassword(formData: FormData) {
  const ctx = await requireStaff();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 12) flash(PATH, "error", "Use at least 12 characters. A few random words make a strong password.");
  if (password.length > 128) flash(PATH, "error", "That password is too long (maximum 128 characters).");
  if (password !== confirm) flash(PATH, "error", "The two passwords do not match.");
  if (/^(.)\1+$/.test(password) || password.toLowerCase().includes(ctx.email.split("@")[0].toLowerCase()) && ctx.email.split("@")[0].length >= 4) {
    flash(PATH, "error", "Choose a password that is not repetitive and does not contain your email name.");
  }
  const sb = await createSupabaseServerClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) flash(PATH, "error", "The password could not be changed. It may be too weak or on a list of known leaked passwords.");
  flash(PATH, "ok", "Password changed.");
}
