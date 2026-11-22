"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/portal/session";
import { flash, dbError } from "@/lib/admin/forms";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_BYTES, parseOrderCsv, type BulkRow } from "@/lib/portal/csv";

export type PreviewLine = { line: number; ref: string; name: string | null; quantity: number | null; unit_price: number | null; currency: string | null; status: string; message: string | null };
export type BulkState = { error?: string; rows?: BulkRow[]; preview?: PreviewLine[] } | null;

const asRows = (raw: string): BulkRow[] | null => {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || v.length === 0 || v.length > 300) return null;
    return v.map((r, i) => ({ line: Number.isInteger(r?.line) ? r.line : i + 1, ref: String(r?.ref ?? "").slice(0, 80), quantity: String(r?.quantity ?? "").slice(0, 20) }));
  } catch { return null; }
};

/** Step 1: read the file and show what the database makes of each row. Nothing is added to the cart yet. */
export async function previewBulk(_prev: BulkState, fd: FormData): Promise<BulkState> {
  const ctx = await requireCustomer();
  const rl = await rateLimit(`pbulk:${ctx.userId}`, 20, 10 * 60 * 1000, { failure: "closed" });
  if (!rl.ok) return { error: "Too many uploads. Please wait a few minutes." };
  const file = fd.get("file");
  let text = String(fd.get("paste") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: "The file is too large. Keep it under 200 KB (about 300 rows)." };
    text = await file.text();
  }
  const parsed = parseOrderCsv(text);
  if (!parsed.ok) return { error: parsed.error };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_bulk_preview", { p_rows: parsed.rows });
  if (error) return { error: dbError(error) };
  return { rows: parsed.rows, preview: (data as PreviewLine[]) ?? [] };
}

/** Step 2: add the rows that pass. The database checks every row again; the preview is never trusted. */
export async function addBulk(fd: FormData) {
  await requireCustomer();
  const rows = asRows(String(fd.get("rows") ?? ""));
  if (!rows) flash("/portal/bulk", "error", "That upload could not be read. Please upload the file again.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_bulk_add", { p_rows: rows });
  if (error) flash("/portal/bulk", "error", dbError(error));
  const r = data as { added: number; skipped: number };
  revalidatePath("/portal/cart");
  if (r.added === 0) flash("/portal/bulk", "error", "None of the rows could be added. Check the reasons shown and try again.");
  flash("/portal/cart", "ok", `${r.added} product${r.added === 1 ? "" : "s"} added to your cart${r.skipped ? `; ${r.skipped} row${r.skipped === 1 ? "" : "s"} skipped` : ""}. Review your cart, then check out.`);
}
