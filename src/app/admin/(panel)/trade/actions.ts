"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";
import { DATA_FIELDS, readLines } from "@/lib/trade";

// Every rule (who may prepare, who may approve, what may change) is enforced by the database functions
// trade_*; these actions only translate the form and report the result.
const DASH = "/admin/trade";
const docPath = (id: string) => `${DASH}/doc/${id}`;

function readData(fd: FormData, type: string) {
  const data: Record<string, string> = {};
  for (const f of DATA_FIELDS[type] ?? []) { const v = str(fd, `d_${f.key}`, 1500); if (v) data[f.key] = v; }
  return data;
}
const uuidOrNull = (v: string) => (isUuid(v) ? v : null);
const dateOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function saveDoc(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id", 40);
  const type = str(formData, "type", 40);
  const back = id ? `${docPath(id)}/edit` : `${DASH}/new?type=${encodeURIComponent(type)}`;
  if (!/^[a-z_]+$/.test(type)) flash(DASH, "error", "Unknown document type.");
  const parent = str(formData, "parent", 40);
  const sb = await createSupabaseServerClient();
  const common = {
    p_supplier: uuidOrNull(str(formData, "supplier_id", 40)), p_customer: uuidOrNull(str(formData, "customer_id", 40)),
    p_title: optStr(formData, "title", 200), p_reference: optStr(formData, "reference", 120),
    p_doc_date: dateOrNull(str(formData, "doc_date", 10)), p_due_date: dateOrNull(str(formData, "due_date", 10)),
    p_currency: str(formData, "currency", 3).toUpperCase() || "KES", p_notes: optStr(formData, "notes", 2000),
    p_data: readData(formData, type), p_lines: readLines(formData), p_warehouse: uuidOrNull(str(formData, "warehouse_id", 40)),
  };
  if (id) {
    if (!isUuid(id)) flash(DASH, "error", "Invalid document.");
    const { error } = await sb.rpc("trade_update_doc", { p_doc: id, ...common });
    if (error) flash(back, "error", dbError(error));
    revalidatePath(DASH, "layout");
    flash(docPath(id), "ok", "Saved.");
  }
  const { data, error } = await sb.rpc("trade_create_doc", { p_type: type, p_parent: isUuid(parent) ? parent : null, ...common });
  if (error || typeof data !== "string") flash(back, "error", dbError(error));
  revalidatePath(DASH, "layout");
  flash(docPath(data as string), "ok", "Draft saved. Check it, then submit it.");
}

export async function submitDoc(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(DASH, "error", "Invalid document.");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("trade_submit", { p_doc: id });
  if (error) flash(docPath(id), "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(docPath(id), "ok", data === "pending_approval" ? "Sent for approval. You will be told the outcome." : "Issued.");
}

export async function completeDoc(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(DASH, "error", "Invalid document.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("trade_complete", { p_doc: id });
  if (error) flash(docPath(id), "error", dbError(error));
  revalidatePath(DASH, "layout");
  flash(docPath(id), "ok", "Marked complete.");
}

export async function cancelDoc(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(DASH, "error", "Invalid document.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("trade_cancel", { p_doc: id, p_reason: str(formData, "reason", 300) });
  if (error) flash(docPath(id), "error", dbError(error));
  revalidatePath(DASH, "layout");
  flash(docPath(id), "ok", "Cancelled.");
}

export async function nextDoc(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id", 40);
  const to = str(formData, "to", 40);
  if (!isUuid(id) || !/^[a-z_]+$/.test(to)) flash(DASH, "error", "Invalid request.");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("trade_next_doc", { p_doc: id, p_type: to });
  if (error || typeof data !== "string") flash(docPath(id), "error", dbError(error));
  revalidatePath(DASH, "layout");
  flash(docPath(data as string), "ok", "Next document created as a draft.");
}

export async function signDoc(formData: FormData) {
  await requireStaff();
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(DASH, "error", "Invalid document.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("trade_sign", { p_doc: id, p_role: str(formData, "role", 60), p_name: str(formData, "name", 120) });
  if (error) flash(docPath(id), "error", dbError(error));
  revalidatePath(DASH, "layout");
  flash(docPath(id), "ok", "Signature recorded.");
}
