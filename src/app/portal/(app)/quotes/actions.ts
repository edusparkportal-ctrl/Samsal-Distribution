"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { flash, dbError, isUuid, optStr } from "@/lib/admin/forms";
import { rateLimit } from "@/lib/rate-limit";

const MAX_ROWS = 12;

/** The customer describes what they need; the database validates every line and files it as an enquiry for our team. */
export async function requestQuote(fd: FormData) {
  const ctx = await requireCustomer();
  const rl = await rateLimit(`pquote:${ctx.userId}`, 8, 60 * 60 * 1000, { failure: "closed" });
  if (!rl.ok) flash("/portal/quotes/new", "error", "Too many requests. Please try again later or contact us.");
  const items: { product_id: string | null; description: string; quantity: string }[] = [];
  for (let i = 0; i < MAX_ROWS; i++) {
    const description = String(fd.get(`description_${i}`) ?? "").trim().slice(0, 200);
    const quantity = String(fd.get(`quantity_${i}`) ?? "").trim().slice(0, 40);
    const pid = String(fd.get(`product_${i}`) ?? "");
    if (!description && !quantity) continue;
    if (!description) flash("/portal/quotes/new", "error", `Line ${i + 1} needs a product or description.`);
    items.push({ product_id: isUuid(pid) ? pid : null, description, quantity });
  }
  if (items.length === 0) flash("/portal/quotes/new", "error", "Add at least one product you would like a price for.");
  const needed = String(fd.get("needed_by") ?? "").trim();
  if (needed && !/^\d{4}-\d{2}-\d{2}$/.test(needed)) flash("/portal/quotes/new", "error", "Choose a valid date.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_request_quote", { p_items: items, p_notes: optStr(fd, "notes", 3000), p_needed_by: needed || null, p_location: optStr(fd, "location", 300) });
  if (error) flash("/portal/quotes/new", "error", dbError(error));
  revalidatePath("/portal/quotes");
  flash("/portal/quotes", "ok", `Request ${String(data)} sent. We will reply with a quotation, usually within one working day.`);
}

export async function decideQuote(fd: FormData) {
  const ctx = await requireCustomer();
  const id = String(fd.get("quote_id") ?? "");
  if (!isUuid(id)) flash("/portal/quotes", "error", "That quotation could not be found.");
  const to = `/portal/quotes/${id}`;
  const decision = String(fd.get("decision") ?? "");
  if (decision !== "accepted" && decision !== "declined") flash(to, "error", "Choose accept or decline.");
  const rl = await rateLimit(`pquote-d:${ctx.userId}`, 20, 60 * 60 * 1000, { failure: "degraded" });
  if (!rl.ok) flash(to, "error", "Too many attempts. Please wait a few minutes.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_quote_decide", { p_quote: id, p_decision: decision, p_note: optStr(fd, "note", 500) });
  if (error) flash(to, "error", dbError(error));
  revalidatePath("/portal/quotes");
  flash(to, "ok", decision === "accepted" ? "Thank you. We have recorded your acceptance and will be in touch to confirm your order." : "We have recorded that you declined this quotation.");
}
