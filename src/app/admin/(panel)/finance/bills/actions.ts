"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";
import { isDate, num } from "@/lib/finance/format";

const PATH = "/admin/finance/bills";

// Bills are RECORDS of what you owe. Nothing here pays a supplier. A bill needs approval from the people named in the
// approval rules before a payment can be recorded, and the person who prepared it cannot record the payment.
async function gate() {
  const a = await checkPermission("finance.bills", "finance");
  if (!a.ok) flash(PATH, "error", a.error);
  return createSupabaseServerClient();
}

export async function createBill(formData: FormData) {
  const sb = await gate();
  const supplier = str(formData, "supplier_id", 40);
  const amount = num(str(formData, "amount", 20));
  const bd = str(formData, "bill_date", 10);
  const dd = str(formData, "due_date", 10);
  if (!isUuid(supplier) || !(amount > 0)) flash(PATH, "error", "Choose the supplier and enter the amount owed.");
  const { error } = await sb.from("supplier_bills").insert({
    supplier_id: supplier, amount, currency: (str(formData, "currency", 3) || "KES").toUpperCase(),
    supplier_reference: optStr(formData, "supplier_reference", 80), bill_date: isDate(bd) ? bd : null, due_date: isDate(dd) ? dd : null, description: optStr(formData, "description", 500),
  });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Draft bill saved. Submit it for approval when it is ready.");
}

export async function billFromPo(formData: FormData) {
  const po = str(formData, "po", 40);
  const sb = await gate();
  if (!isUuid(po)) flash(PATH, "error", "Invalid order.");
  const { error } = await sb.rpc("create_bill_from_po", { p_po: po });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Draft bill created from the purchase order. Check it against the supplier's invoice, then submit it.");
}

export async function submitBill(formData: FormData) {
  const id = str(formData, "id", 40);
  const sb = await gate();
  if (!isUuid(id)) flash(PATH, "error", "Invalid bill.");
  const { error } = await sb.rpc("submit_bill", { p_id: id });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Submitted for approval.");
}

export async function recordBillPayment(formData: FormData) {
  const id = str(formData, "id", 40);
  const sb = await gate();
  const amount = num(str(formData, "amount", 20));
  const date = str(formData, "paid_on", 10);
  if (!isUuid(id) || !(amount > 0)) flash(PATH, "error", "Enter the amount paid.");
  const { error } = await sb.rpc("record_bill_payment", { p_bill: id, p_amount: amount, p_paid_on: isDate(date) ? date : null, p_method: str(formData, "method", 10) || "bank", p_reference: str(formData, "reference", 120) });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Payment recorded. Remember the payment itself is made outside this system.");
}

export async function voidBill(formData: FormData) {
  const id = str(formData, "id", 40);
  const sb = await gate();
  if (!isUuid(id)) flash(PATH, "error", "Invalid bill.");
  const { error } = await sb.rpc("void_bill", { p_id: id, p_reason: str(formData, "reason", 300) });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Bill voided.");
}
