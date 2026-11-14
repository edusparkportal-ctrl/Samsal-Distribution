import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DOC_ENTITIES, isDocEntity } from "@/lib/record-docs";
import { isUuid } from "@/lib/admin/forms";

export const dynamic = "force-dynamic";

/** Permission-checked download: creates a 60-second signed link on demand, so no file URL is ever stored in a page. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const sb = await createSupabaseServerClient();
  const { data: doc } = await sb.from("record_documents").select("entity_type, media:media_assets(storage_path, file_name, bucket)").eq("id", id).maybeSingle();
  if (!doc || !isDocEntity(doc.entity_type)) return new NextResponse("Not found", { status: 404 });
  const rule = DOC_ENTITIES[doc.entity_type as keyof typeof DOC_ENTITIES];
  const auth = await checkPermission(rule.view, rule.module);
  if (!auth.ok) return new NextResponse(auth.error, { status: 403 });
  const media = Array.isArray(doc.media) ? doc.media[0] : doc.media;
  if (!media || media.bucket !== "private-docs") return new NextResponse("Not found", { status: 404 });
  const { data, error } = await sb.storage.from("private-docs").createSignedUrl(media.storage_path, 60, { download: media.file_name });
  if (error || !data?.signedUrl) return new NextResponse("The file could not be opened.", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
