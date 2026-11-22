"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, str } from "@/lib/admin/forms";

const STATUSES = ["open", "in_progress", "awaiting_customer", "resolved", "closed"];

/** Reply to the customer, or leave an internal note that the customer never sees. */
export async function staffReply(fd: FormData) {
  const id = str(fd, "ticket_id", 40);
  if (!isUuid(id)) flash("/admin/portal/tickets", "error", "Invalid ticket.");
  const to = `/admin/portal/tickets/${id}`;
  const auth = await checkPermission("portal.manage", "portal");
  if (!auth.ok) flash(to, "error", auth.error);
  const body = str(fd, "body", 4000);
  if (!body) flash(to, "error", "Write a message first.");
  const internal = fd.get("internal") === "on";
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("support_messages").insert({ ticket_id: id, author_type: "staff", body, internal });
  if (error) flash(to, "error", dbError(error));
  revalidatePath(to);
  flash(to, "ok", internal ? "Internal note saved. The customer cannot see it." : "Reply sent to the customer.");
}

export async function setTicketStatus(fd: FormData) {
  const id = str(fd, "ticket_id", 40);
  if (!isUuid(id)) flash("/admin/portal/tickets", "error", "Invalid ticket.");
  const to = `/admin/portal/tickets/${id}`;
  const auth = await checkPermission("portal.manage", "portal");
  if (!auth.ok) flash(to, "error", auth.error);
  const status = str(fd, "status", 30);
  if (!STATUSES.includes(status)) flash(to, "error", "Choose a valid status.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("support_tickets").update({ status }).eq("id", id);
  if (error) flash(to, "error", dbError(error));
  revalidatePath(to); revalidatePath("/admin/portal/tickets");
  flash(to, "ok", "Status updated.");
}

export async function assignToMe(fd: FormData) {
  const id = str(fd, "ticket_id", 40);
  if (!isUuid(id)) flash("/admin/portal/tickets", "error", "Invalid ticket.");
  const to = `/admin/portal/tickets/${id}`;
  const auth = await checkPermission("portal.manage", "portal");
  if (!auth.ok) flash(to, "error", auth.error);
  const sb = await createSupabaseServerClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) flash(to, "error", "Please sign in again.");
  const { error } = await sb.from("support_tickets").update({ assigned_to: u.user!.id, status: "in_progress" }).eq("id", id).in("status", ["open", "awaiting_customer", "in_progress"]);
  if (error) flash(to, "error", dbError(error));
  revalidatePath(to); revalidatePath("/admin/portal/tickets");
  flash(to, "ok", "Assigned to you.");
}
