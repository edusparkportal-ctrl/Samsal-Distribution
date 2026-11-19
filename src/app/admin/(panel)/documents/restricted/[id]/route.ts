import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";

export const dynamic = "force-dynamic";

/** Permission-checked, logged download. The database function checks access and records who opened the file; the link lasts 60 seconds. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await createSupabaseServerClient();
  const { data, error } = await sb.rpc("restricted_doc_open", { p_id: id });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.storage_path) return new NextResponse("Not found", { status: 404 });
  const { data: signed, error: sErr } = await sb.storage.from("restricted-docs").createSignedUrl(row.storage_path, 60, { download: row.file_name });
  if (sErr || !signed?.signedUrl) return new NextResponse("The file could not be opened.", { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
