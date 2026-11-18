"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, str } from "@/lib/admin/forms";

const PATH = "/admin/people/applicants";

export async function hireApplicant(formData: FormData) {
  const auth = await checkPermission("people.manage", "people");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const id = str(formData, "id", 40);
  const date = str(formData, "hire_date", 10);
  if (!isUuid(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) flash(PATH, "error", "Choose the start date.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("hire_applicant", { p_applicant: id, p_hire_date: date });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Employee record created, and onboarding tasks started. Link their sign-in account and add a contract next.");
}
