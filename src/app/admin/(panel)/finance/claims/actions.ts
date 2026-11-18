"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, str } from "@/lib/admin/forms";
import { isDate, num } from "@/lib/finance/format";

const PATH = "/admin/finance/claims";

export async function submitClaim(formData: FormData) {
  const a = await checkPermission("finance.claims", "finance");
  if (!a.ok) flash(PATH, "error", a.error);
  const sb = await createSupabaseServerClient();
  const { data: me } = await sb.rpc("my_employee_id");
  if (!me) flash(PATH, "error", "No employee record is linked to your account. Ask HR to link it.");
  const amount = num(str(formData, "amount", 20));
  const date = str(formData, "expense_date", 10);
  const cat = str(formData, "category_id", 40);
  const desc = str(formData, "description", 500);
  if (!isUuid(cat) || !isDate(date) || !(amount > 0) || !desc) flash(PATH, "error", "Choose a category, date, amount and say what it was for.");
  const { error } = await sb.from("expense_claims").insert({ employee_id: me, category_id: cat, expense_date: date, amount, currency: (str(formData, "currency", 3) || "KES").toUpperCase(), description: desc });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Claim submitted for approval.");
}

export async function cancelClaim(formData: FormData) {
  const a = await checkPermission("finance.claims", "finance");
  if (!a.ok) flash(PATH, "error", a.error);
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(PATH, "error", "Invalid claim.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cancel_expense_claim", { p_id: id });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Claim cancelled.");
}

export async function markReimbursed(formData: FormData) {
  const a = await checkPermission("finance.bills", "finance");
  if (!a.ok) flash(PATH, "error", a.error);
  const id = str(formData, "id", 40);
  const date = str(formData, "paid_on", 10);
  if (!isUuid(id)) flash(PATH, "error", "Invalid claim.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("record_expense_paid", { p_id: id, p_reference: str(formData, "reference", 120), p_paid_on: isDate(date) ? date : null });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Reimbursement recorded. The payment itself is made outside this system.");
}
