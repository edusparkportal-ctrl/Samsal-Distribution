"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";
import { parseLineText } from "@/lib/quotation";

const LIST = "/admin/quotations";
const isDate = (v: string | null) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));

/** Create a draft quotation, optionally from an enquiry (copies the customer and a starter line). */
export async function createQuotation(fd: FormData) {
  const auth = await checkPermission("quotations.manage", "quotations");
  if (!auth.ok) flash(LIST, "error", auth.error);
  const enquiryId = optStr(fd, "enquiry_id", 40);
  if (enquiryId && !isUuid(enquiryId)) flash(LIST, "error", "Unknown enquiry.");
  const sb = await createSupabaseServerClient();

  let customerId = optStr(fd, "customer_id", 40);
  let starter: string | null = null;
  if (enquiryId) {
    const { data: e } = await sb.from("enquiries").select("customer_id, product_text, quantity_text").eq("id", enquiryId).maybeSingle();
    if (!e) flash(LIST, "error", "That enquiry was not found.");
    customerId = e!.customer_id;
    starter = e!.product_text;
  }
  if (!customerId || !isUuid(customerId)) flash(enquiryId ? `${LIST}/new?enquiry=${enquiryId}` : `${LIST}/new`, "error", "Choose a customer.");

  const { data: co } = await sb.from("company_settings").select("currency, quotation_terms, quotation_validity_days").eq("id", 1).maybeSingle();
  const { data: number, error: nErr } = await sb.rpc("next_quotation_number");
  if (nErr || !number) flash(LIST, "error", dbError(nErr));
  const days = co?.quotation_validity_days ?? 14;
  const valid = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb.from("quotations").insert({
    number, enquiry_id: enquiryId, customer_id: customerId, currency: co?.currency ?? "KES", valid_until: valid,
    notes: null, prepared_by: auth.ok ? auth.ctx.userId : null,
  }).select("id").single();
  if (error) flash(LIST, "error", dbError(error));
  if (starter) await sb.from("quotation_items").insert({ quotation_id: data!.id, line_no: 1, description: starter.slice(0, 500), quantity: 1, unit_price: 0 });
  if (enquiryId) await sb.from("enquiries").update({ status: "quotation_prepared" }).eq("id", enquiryId).in("status", ["new", "under_review", "sourcing"]);
  revalidatePath(LIST);
  flash(`${LIST}/${data!.id}`, "ok", "Draft quotation created. Add the lines and prices.");
}

/** Save header fields and replace all lines (draft only; the database also refuses edits after issue). */
export async function saveQuotation(fd: FormData) {
  const id = str(fd, "id", 40);
  const back = `${LIST}/${id}`;
  const auth = await checkPermission("quotations.manage", "quotations");
  if (!auth.ok) flash(isUuid(id) ? back : LIST, "error", auth.error);
  if (!isUuid(id)) flash(LIST, "error", "Unknown quotation.");
  const issue = str(fd, "issue_date", 10), valid = optStr(fd, "valid_until", 10);
  if (!isDate(issue) || !isDate(valid)) flash(back, "error", "Enter valid dates.");
  if (valid && valid < issue) flash(back, "error", "'Valid until' cannot be before the issue date.");
  const tax = Number(str(fd, "tax_rate_percent", 8) || "0");
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) flash(back, "error", "Tax rate must be between 0 and 100.");
  const { lines, errors } = parseLineText(str(fd, "lines", 40000));
  if (errors.length) flash(back, "error", errors[0]);
  if (lines.length === 0) flash(back, "error", "Add at least one line.");

  const sb = await createSupabaseServerClient();
  const { data: cur } = await sb.from("quotations").select("status").eq("id", id).maybeSingle();
  if (!cur) flash(LIST, "error", "Quotation not found.");
  if (cur!.status !== "draft") flash(back, "error", "Only draft quotations can be edited.");

  // Resolve unit codes/abbreviations against the units table; unknown units are an error, not silently dropped.
  const { data: units } = await sb.from("units").select("id, code, abbreviation");
  const unitId = (u: string | null | undefined) => {
    if (!u) return null;
    const k = u.toLowerCase();
    return (units ?? []).find((x: { id: string; code: string; abbreviation: string }) => x.code === k || x.abbreviation.toLowerCase() === k)?.id ?? undefined;
  };
  const rows = [];
  for (const [i, l] of lines.entries()) {
    const uid = unitId(l.unit);
    if (uid === undefined) flash(back, "error", `Line ${i + 1}: unknown unit "${l.unit}". Use a unit from the list (e.g. carton, box, piece, kg).`);
    rows.push({ quotation_id: id, line_no: i + 1, description: l.description, quantity: l.quantity, unit_price: l.unitPrice, unit_id: uid ?? null });
  }

  const { error: hErr } = await sb.from("quotations").update({
    issue_date: issue, valid_until: valid, tax_rate_percent: tax, delivery_terms: optStr(fd, "delivery_terms", 1000),
    payment_terms: optStr(fd, "payment_terms", 1000), notes: optStr(fd, "notes", 2000),
  }).eq("id", id);
  if (hErr) flash(back, "error", dbError(hErr));
  // Insert the new set first so a failure never leaves the quotation without lines, then remove the old rows.
  const { data: old } = await sb.from("quotation_items").select("id").eq("quotation_id", id);
  const offset = 1000;
  const { error: iErr } = await sb.from("quotation_items").insert(rows.map((r) => ({ ...r, line_no: r.line_no + offset })));
  if (iErr) flash(back, "error", dbError(iErr));
  if (old?.length) await sb.from("quotation_items").delete().in("id", old.map((o: { id: string }) => o.id));
  const { data: fresh } = await sb.from("quotation_items").select("id, line_no").eq("quotation_id", id);
  for (const f of fresh ?? []) await sb.from("quotation_items").update({ line_no: f.line_no - offset }).eq("id", f.id);
  revalidatePath(back);
  flash(back, "ok", "Quotation saved.");
}

export async function setQuotationStatus(fd: FormData) {
  const id = str(fd, "id", 40), to = str(fd, "to", 20);
  const back = `${LIST}/${id}`;
  const auth = await checkPermission("quotations.manage", "quotations");
  if (!auth.ok) flash(isUuid(id) ? back : LIST, "error", auth.error);
  if (!isUuid(id)) flash(LIST, "error", "Unknown quotation.");
  if (!["sent", "accepted", "declined", "cancelled"].includes(to)) flash(back, "error", "Unknown status.");
  const sb = await createSupabaseServerClient();
  const { data: q } = await sb.from("quotations").select("status, enquiry_id").eq("id", id).maybeSingle();
  if (!q) flash(LIST, "error", "Quotation not found.");
  const ok: Record<string, string[]> = { draft: ["sent", "cancelled"], sent: ["accepted", "declined", "cancelled"] };
  if (!ok[q!.status]?.includes(to)) flash(back, "error", `A ${q!.status} quotation cannot be marked ${to}.`);
  if (to === "sent") {
    const { count } = await sb.from("quotation_items").select("id", { count: "exact", head: true }).eq("quotation_id", id);
    if (!count) flash(back, "error", "Add at least one line before marking the quotation as sent.");
  }
  const { error } = await sb.from("quotations").update({ status: to, ...(to === "accepted" || to === "declined" ? { decision_note: optStr(fd, "decision_note", 1000) } : {}) }).eq("id", id);
  if (error) flash(back, "error", dbError(error));
  if (q!.enquiry_id && ["sent", "accepted", "declined"].includes(to)) {
    await sb.from("enquiries").update({ status: to }).eq("id", q!.enquiry_id);
  }
  revalidatePath(LIST);
  flash(back, "ok", `Quotation marked ${to}. Sending it to the customer is still done by you (download the PDF and email it).`);
}

export async function deleteDraft(fd: FormData) {
  const id = str(fd, "id", 40);
  const auth = await checkPermission("quotations.manage", "quotations");
  if (!auth.ok) flash(LIST, "error", auth.error);
  if (!isUuid(id)) flash(LIST, "error", "Unknown quotation.");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.from("quotations").delete().eq("id", id).eq("status", "draft").select("id");
  if (error) flash(LIST, "error", dbError(error));
  if (!data?.length) flash(LIST, "error", "Only drafts can be deleted.");
  revalidatePath(LIST);
  flash(LIST, "ok", "Draft deleted.");
}
