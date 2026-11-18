"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, isUuid, str } from "@/lib/admin/forms";

const PATH = "/admin/people/leave";

export async function cancelLeave(formData: FormData) {
  const auth = await checkPermission("people.manage", "people");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(PATH, "error", "Invalid request.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("cancel_leave_request", { p_id: id });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Leave cancelled.");
}
