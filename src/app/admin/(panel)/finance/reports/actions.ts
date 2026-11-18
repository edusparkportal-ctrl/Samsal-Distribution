"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbError, flash, str } from "@/lib/admin/forms";

const PATH = "/admin/finance/reports";

export async function buildReport(formData: FormData) {
  const a = await checkPermission("finance.reports", "finance");
  if (!a.ok) flash(PATH, "error", a.error);
  const month = str(formData, "month", 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) flash(PATH, "error", "Choose a month.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.rpc("build_finance_report", { p_month: `${month}-01` });
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH);
  flash(`${PATH}?month=${month}`, "ok", "Report built from the books as they are now.");
}
