"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";
import { isDate, num } from "@/lib/finance/format";

const LIST = "/admin/finance/invoices";
const one = (id: string) => `${LIST}/${id}`;

async function gate(back = LIST) {
  const a = await checkPermission("finance.invoices", "finance");
  if (!a.ok) flash(back, "error", a.error);
  return createSupabaseServerClient();
}

export async function createInvoice(formData: FormData) {
  const sb = await gate(`${LIST}/new`);
  const customer = str(formData, "customer_id", 40);
  const rate = num(str(formData, "tax_rate", 10) || "0");
  const due = str(formData, "due_date", 10);
  if (!isUuid(customer)) flash(`${LIST}/new`, "error", "Choose the customer.");
  if (!(rate >= 0 && rate <= 100)) flash(`${LIST}/new`, "error", "Tax rate must be between 0 and 100.");
  const { data, error } = await sb.from("invoices").insert({
    customer_id: customer, tax_rate: rate, currency: (str(formData, "currency", 3) || "KES").toUpperCase(),
    due_date: isDate(due) ? due : null, notes: optStr(formData, "notes", 2000),
  }).select("id").single();
  if (error) flash(`${LIST}/new`, "error", dbError(error));
  revalidatePath(LIST);
  flash(one((data as { id: string }).id), "ok", "Draft invoice created. Add the lines, then issue it.");
}

export async function addLine(formData: FormData) {
  const id = str(formData, "id", 40);
  const sb = await gate();
  const qty = num(str(formData, "quantity", 20));
  const price = num(str(formData, "unit_price", 20));
  const desc = str(formData, "description", 300);
  if (!isUuid(id) || !desc || !(qty > 0) || !(price >= 0)) flash(one(id), "error", "Enter a description, a quantity above zero and a price.");
  const { data: last } = await sb.from("invoice_items").select("line_no").eq("invoice_id", id).order("line_no", { ascending: false }).limit(1);
  const { error } = await sb.from("invoice_items").insert({ invoice_id: id, line_no: ((last?.[0]?.line_no as number | undefined) ?? 0) + 1, description: desc, quantity: qty, unit_price: price });
  if (error) flash(one(id), "error", dbError(error));
  revalidatePath(one(id));
  flash(one(id), "ok", "Line added.");
}

export async function removeLine(formData: FormData) {
  const id = str(formData, "id", 40);
  const line = str(formData, "line", 40);
  const sb = await gate();
  if (!isUuid(id) || !isUuid(line)) flash(LIST, "error", "Invalid line.");
  const { error } = await sb.from("invoice_items").delete().eq("id", line).eq("invoice_id", id);
  if (error) flash(one(id), "error", dbError(error));
  revalidatePath(one(id));
  flash(one(id), "ok", "Line removed.");
}

export async function saveDraft(formData: FormData) {
  const id = str(formData, "id", 40);
  const sb = await gate();
  const rate = num(str(formData, "tax_rate", 10) || "0");
  const due = str(formData, "due_date", 10);
  if (!isUuid(id) || !(rate >= 0 && rate <= 100)) flash(one(id), "error", "Tax rate must be between 0 and 100.");
  const { error } = await sb.from("invoices").update({ tax_rate: rate, due_date: isDate(due) ? due : null, notes: optStr(formData, "notes", 2000) }).eq("id", id);
  if (error) flash(one(id), "error", dbError(error));
  revalidatePath(one(id));
  flash(one(id), "ok", "Saved.");
}

export async function issueInvoice(formData: FormData) {
  const id = str(formData, "id", 40);
  const sb = await gate();
  if (!isUuid(id)) flash(LIST, "error", "Invalid invoice.");
  const { error } = await sb.rpc("issue_invoice", { p_id: id });
  if (error) flash(one(id), "error", dbError(error));
  revalidatePath(LIST);
  flash(one(id), "ok", "Invoice issued. Send it to the customer yourself (print or save as PDF). Nothing is sent automatically.");
}

export async function recordPayment(formData: FormData) {
  const id = str(formData, "id", 40);
  const sb = await gate();
  const amount = num(str(formData, "amount", 20));
  const date = str(formData, "paid_on", 10);
  if (!isUuid(id) || !(amount > 0)) flash(one(id), "error", "Enter the amount received.");
  const { error } = await sb.rpc("record_invoice_payment", { p_invoice: id, p_amount: amount, p_paid_on: isDate(date) ? date : null, p_method: str(formData, "method", 10) || "bank", p_reference: str(formData, "reference", 120) });
  if (error) flash(one(id), "error", dbError(error));
  revalidatePath(LIST);
  flash(one(id), "ok", "Payment recorded and posted to the ledger.");
}

export async function voidInvoice(formData: FormData) {
  const id = str(formData, "id", 40);
  const sb = await gate();
  if (!isUuid(id)) flash(LIST, "error", "Invalid invoice.");
  const { error } = await sb.rpc("void_invoice", { p_id: id, p_reason: str(formData, "reason", 300) });
  if (error) flash(one(id), "error", dbError(error));
  revalidatePath(LIST);
  flash(one(id), "ok", "Invoice voided.");
}

export async function invoiceFromOrder(formData: FormData) {
  const order = str(formData, "order", 40);
  const sb = await gate();
  if (!isUuid(order)) flash(LIST, "error", "Invalid order.");
  const { data, error } = await sb.rpc("create_invoice_from_order", { p_order: order });
  if (error) flash(LIST, "error", dbError(error));
  revalidatePath(LIST);
  flash(one(data as string), "ok", "Draft invoice created from the order. Review it, then issue it.");
}
