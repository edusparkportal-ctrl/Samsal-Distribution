"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid, str } from "@/lib/admin/forms";

// RLS limits every statement here to the signed-in person's own notifications.
async function ready() {
  await requireStaff();
  return createSupabaseServerClient();
}

export async function markRead(formData: FormData) {
  const sb = await ready();
  const id = str(formData, "id", 40);
  if (isUuid(id)) await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  revalidatePath("/admin", "layout");
  redirect("/admin/notifications");
}

export async function markAllRead() {
  const sb = await ready();
  await sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/admin", "layout");
  redirect("/admin/notifications");
}

export async function clearRead() {
  const sb = await ready();
  await sb.from("notifications").delete().not("read_at", "is", null);
  revalidatePath("/admin", "layout");
  redirect("/admin/notifications");
}
