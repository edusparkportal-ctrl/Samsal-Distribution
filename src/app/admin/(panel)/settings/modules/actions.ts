"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bool, dbError, flash, str } from "@/lib/admin/forms";

const PATH = "/admin/settings/modules";

export async function setModuleEnabled(formData: FormData) {
  const auth = await checkPermission("settings.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const key = str(formData, "key", 40);
  if (!/^[a-z][a-z_]{1,30}$/.test(key)) flash(PATH, "error", "Invalid module.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("modules").update({ enabled: bool(formData, "enabled") }).eq("key", key);
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath("/admin", "layout");
  flash(PATH, "ok", "Module updated.");
}
