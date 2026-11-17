"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bool, dbError, flash, isUuid, str } from "@/lib/admin/forms";

const PATH = "/admin/checklists";

export async function toggleItem(formData: FormData) {
  const auth = await checkPermission("tenders.manage", "tenders");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(PATH, "error", "Invalid item.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("tender_checklist_items").update({ is_done: bool(formData, "done") }).eq("id", id);
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Checklist updated.");
}

export async function addItem(formData: FormData) {
  const auth = await checkPermission("tenders.manage", "tenders");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const tender = str(formData, "tender_id", 40);
  const label = str(formData, "label", 400);
  if (!isUuid(tender) || !label) flash(PATH, "error", "Enter the item to add.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("tender_checklist_items").insert({ tender_id: tender, label, source: "manual", sort_order: 500 });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", "Item added.");
}

export async function generateChecklist(formData: FormData) {
  const auth = await checkPermission("tenders.manage", "tenders");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const tender = str(formData, "tender_id", 40);
  if (!isUuid(tender)) flash(PATH, "error", "Invalid tender.");
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("generate_tender_checklist", { p_tender: tender });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(PATH, "ok", `${typeof data === "number" ? data : 0} item(s) added.`);
}
