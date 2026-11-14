"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DOC_ENTITIES, isDocEntity } from "@/lib/record-docs";
import { FOLDER_RE, STORAGE_PATH_RE, extensionOf, inspectBytes } from "@/lib/media";
import { dbError, flash, isUuid, str } from "@/lib/admin/forms";

export type DocResult = { ok: true; message: string } | { ok: false; error: string };
const BUCKET = "private-docs" as const;

/** Verifies a file the browser uploaded to the private bucket, then links it to a record. */
export async function registerRecordDocument(input: { path: string; originalName: string; entityType: string; entityId: string; label: string; revalidate: string }): Promise<DocResult> {
  const entityType = String(input.entityType ?? "");
  if (!isDocEntity(entityType) || !isUuid(String(input.entityId ?? ""))) return { ok: false, error: "Invalid request." };
  const rule = DOC_ENTITIES[entityType];
  const auth = await checkPermission(rule.manage, rule.module);
  if (!auth.ok) return { ok: false, error: auth.error };
  const sb = await createSupabaseServerClient();
  const path = String(input.path ?? "");
  if (!STORAGE_PATH_RE.test(path) || !path.startsWith(`${entityType}/`)) return { ok: false, error: "Invalid upload." };
  const fail = async (error: string): Promise<DocResult> => { await sb.storage.from(BUCKET).remove([path]); return { ok: false, error }; };

  const { data: blob, error: dl } = await sb.storage.from(BUCKET).download(path);
  if (dl || !blob) return { ok: false, error: "The uploaded file could not be found. Please try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const stored = path.slice(path.lastIndexOf("/") + 1);
  const check = inspectBytes(BUCKET, stored, bytes);
  if (!check.ok) return fail(check.error);
  const fileName = String(input.originalName ?? "").split(/[\\/]/).pop()!.slice(0, 200) || stored;
  if (extensionOf(fileName) !== check.ext) return fail("The file name does not match the file type.");

  const { data: media, error: mErr } = await sb.from("media_assets").insert({
    bucket: BUCKET, storage_path: path, file_name: fileName, folder: entityType, mime_type: check.mime, size_bytes: bytes.length, uploaded_by: auth.ctx.userId,
  }).select("id").single();
  if (mErr || !media) return fail(dbError(mErr));
  const { error: rErr } = await sb.from("record_documents").insert({
    entity_type: entityType, entity_id: input.entityId, media_id: media.id, label: String(input.label ?? "").trim().slice(0, 120) || null, created_by: auth.ctx.userId,
  });
  if (rErr) { await sb.from("media_assets").update({ deleted_at: new Date().toISOString() }).eq("id", media.id); return fail(dbError(rErr)); }
  if (/^\/admin\/[a-z0-9/_-]*$/.test(input.revalidate ?? "")) revalidatePath(input.revalidate);
  return { ok: true, message: `${fileName} attached.` };
}

export async function removeRecordDocument(fd: FormData) {
  const id = str(fd, "id", 40), back = str(fd, "back", 200);
  const safeBack = /^\/admin\/[a-zA-Z0-9/_?=&%-]*$/.test(back) ? back : "/admin";
  if (!isUuid(id)) flash(safeBack, "error", "Invalid request.");
  const sb = await createSupabaseServerClient();
  const { data: doc } = await sb.from("record_documents").select("id, entity_type, media_id").eq("id", id).maybeSingle();
  if (!doc || !isDocEntity(doc.entity_type)) flash(safeBack, "error", "Document not found.");
  const rule = DOC_ENTITIES[doc!.entity_type as keyof typeof DOC_ENTITIES];
  const auth = await checkPermission(rule.manage, rule.module);
  if (!auth.ok) flash(safeBack, "error", auth.error);
  const { data: media } = await sb.from("media_assets").select("storage_path").eq("id", doc!.media_id).maybeSingle();
  const { data: gone, error } = await sb.from("record_documents").delete().eq("id", id).select("id");
  if (error) flash(safeBack, "error", dbError(error));
  if (!gone?.length) flash(safeBack, "error", "Nothing was removed. You may not have permission.");
  await sb.from("media_assets").update({ deleted_at: new Date().toISOString() }).eq("id", doc!.media_id);
  if (media?.storage_path) await sb.storage.from(BUCKET).remove([media.storage_path]);
  flash(safeBack, "ok", "Document removed.");
}
