"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";
import { ENQUIRY_SOURCES, isEnquiryStatus } from "@/lib/crm";

const LIST = "/admin/crm/enquiries";
const dateOrNull = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

export async function updateEnquiry(fd: FormData) {
  const id = str(fd, "id", 40);
  const back = `${LIST}/${id}`;
  const auth = await checkPermission("enquiries.manage", "crm");
  if (!auth.ok) flash(isUuid(id) ? back : LIST, "error", auth.error);
  if (!isUuid(id)) flash(LIST, "error", "Unknown enquiry.");
  const status = str(fd, "status", 30);
  if (!isEnquiryStatus(status)) flash(back, "error", "Choose a valid status.");
  const assigned = optStr(fd, "assigned_to", 40);
  if (assigned && !isUuid(assigned)) flash(back, "error", "Choose a valid team member.");
  const raw = optStr(fd, "follow_up_date", 10);
  if (raw && !dateOrNull(raw)) flash(back, "error", "Enter a valid follow-up date.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("enquiries").update({ status, assigned_to: assigned, follow_up_date: raw }).eq("id", id);
  if (error) flash(back, "error", dbError(error));
  revalidatePath(LIST);
  flash(back, "ok", "Enquiry updated.");
}

export async function addNote(fd: FormData) {
  const id = str(fd, "id", 40);
  const back = `${LIST}/${id}`;
  const auth = await checkPermission("enquiries.manage", "crm");
  if (!auth.ok) flash(isUuid(id) ? back : LIST, "error", auth.error);
  if (!isUuid(id)) flash(LIST, "error", "Unknown enquiry.");
  const body = str(fd, "body", 4000);
  if (!body) flash(back, "error", "Write a note first.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("enquiry_notes").insert({ enquiry_id: id, body, author_id: auth.ok ? auth.ctx.userId : null });
  if (error) flash(back, "error", dbError(error));
  flash(back, "ok", "Note added.");
}

/** Log an enquiry that arrived by phone, email, walk-in, etc. */
export async function createEnquiry(fd: FormData) {
  const auth = await checkPermission("enquiries.manage", "crm");
  if (!auth.ok) flash(`${LIST}/new`, "error", auth.error);
  const contact = str(fd, "contact_name", 120), email = str(fd, "email", 200).toLowerCase();
  const product = str(fd, "product_text", 2000);
  const source = str(fd, "source", 20);
  if (!contact || !product) flash(`${LIST}/new`, "error", "Contact name and what they need are required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash(`${LIST}/new`, "error", "Enter a valid email address.");
  if (!(ENQUIRY_SOURCES as readonly string[]).includes(source)) flash(`${LIST}/new`, "error", "Choose a source.");
  const company = optStr(fd, "company_name", 160);
  const sb = await createSupabaseServerClient();
  let q = sb.from("customers").select("id").is("deleted_at", null).eq("email", email);
  q = company ? q.eq("company_name", company) : q.is("company_name", null);
  const found = await q.limit(1).maybeSingle();
  let customerId: string | null = found.data?.id ?? null;
  if (!customerId) {
    const ins = await sb.from("customers").insert({ contact_name: contact, email, company_name: company, phone: optStr(fd, "phone", 40), location: optStr(fd, "delivery_location", 200) }).select("id").single();
    if (ins.error) flash(`${LIST}/new`, "error", dbError(ins.error));
    customerId = ins.data!.id;
  }
  const req = dateOrNull(optStr(fd, "required_by", 10));
  const { data, error } = await sb.from("enquiries").insert({
    customer_id: customerId, product_text: product, quantity_text: optStr(fd, "quantity_text", 200), delivery_location: optStr(fd, "delivery_location", 200),
    required_by: req, message: optStr(fd, "message", 4000), source, assigned_to: auth.ok ? auth.ctx.userId : null,
  }).select("id").single();
  if (error) flash(`${LIST}/new`, "error", dbError(error));
  revalidatePath(LIST);
  flash(`${LIST}/${data!.id}`, "ok", "Enquiry logged.");
}

export async function updateCustomer(fd: FormData) {
  const id = str(fd, "id", 40);
  const auth = await checkPermission("enquiries.manage", "crm");
  if (!auth.ok) flash("/admin/crm/customers", "error", auth.error);
  if (!isUuid(id)) flash("/admin/crm/customers", "error", "Unknown customer.");
  const email = str(fd, "email", 200).toLowerCase(), name = str(fd, "contact_name", 120);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash("/admin/crm/customers", "error", "Name and a valid email are required.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("customers").update({ contact_name: name, email, company_name: optStr(fd, "company_name", 160), phone: optStr(fd, "phone", 40), location: optStr(fd, "location", 200) }).eq("id", id);
  if (error) flash("/admin/crm/customers", "error", dbError(error));
  flash("/admin/crm/customers", "ok", "Customer updated.");
}
