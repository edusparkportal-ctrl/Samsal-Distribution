"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { flash, dbError, isUuid, str } from "@/lib/admin/forms";
import { rateLimit } from "@/lib/rate-limit";

export async function createTicket(fd: FormData) {
  const ctx = await requireCustomer();
  const rl = await rateLimit(`ptkt:${ctx.userId}`, 8, 60 * 60 * 1000, { failure: "closed" });
  if (!rl.ok) flash("/portal/support/new", "error", "Too many requests. Please try again later or call us.");
  const order = String(fd.get("order_id") ?? ""), invoice = String(fd.get("invoice_id") ?? "");
  if ((order && !isUuid(order)) || (invoice && !isUuid(invoice))) flash("/portal/support/new", "error", "Invalid selection.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_ticket_create", { p_subject: str(fd, "subject", 150), p_category: str(fd, "category", 20), p_body: str(fd, "body", 4000), p_order: order || null, p_invoice: invoice || null });
  if (error) flash("/portal/support/new", "error", dbError(error));
  revalidatePath("/portal/support");
  flash(`/portal/support/${String(data)}`, "ok", "Your ticket has been sent. We will reply here.");
}

export async function replyTicket(fd: FormData) {
  const ctx = await requireCustomer();
  const id = String(fd.get("ticket_id") ?? "");
  if (!isUuid(id)) flash("/portal/support", "error", "That ticket could not be found.");
  const to = `/portal/support/${id}`;
  const rl = await rateLimit(`ptkt-r:${ctx.userId}`, 20, 60 * 60 * 1000, { failure: "degraded" });
  if (!rl.ok) flash(to, "error", "Too many messages. Please wait a little.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_ticket_reply", { p_ticket: id, p_body: str(fd, "body", 4000) });
  if (error) flash(to, "error", dbError(error));
  revalidatePath(to);
  flash(to, "ok", "Message sent.");
}

export async function closeTicket(fd: FormData) {
  await requireCustomer();
  const id = String(fd.get("ticket_id") ?? "");
  if (!isUuid(id)) flash("/portal/support", "error", "That ticket could not be found.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("portal_ticket_close", { p_ticket: id });
  if (error) flash(`/portal/support/${id}`, "error", dbError(error));
  revalidatePath("/portal/support");
  flash("/portal/support", "ok", "Ticket closed. You can open a new one any time.");
}
