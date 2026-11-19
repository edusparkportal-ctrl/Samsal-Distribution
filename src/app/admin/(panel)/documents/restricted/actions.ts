"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RESTRICTED_ENTITIES, isRestrictedEntity } from "@/lib/restricted-docs";
import { STORAGE_PATH_RE, extensionOf, inspectBytes } from "@/lib/media";
import { dbError, flash, isUuid, str } from "@/lib/admin/forms";

export type DocResult = { ok: true; message: string } | { ok: false; error: string };
const BUCKET = "restricted-docs" as const;

/** Verifies a file the browser uploaded to the restricted bucket, then indexes it against an HR or Finance record. Row Level Security decides who may. */
export async function registerRestrictedDocument(input: { path: string; originalName: string; entityType: string; entityId: string; label: string; revalidate: string }): Promise<DocResult> {
  const entityType = String(input.entityType ?? "");
  if (!isRestrictedEntity(entityType) || !isUuid(String(input.entityId ?? ""))) return { ok: false, error: "Invalid request." };
  const rule = RESTRICTED_ENTITIES[entityType];
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

  const { error } = await sb.from("restricted_documents").insert({
    entity_type: entityType, entity_id: input.entityId, label: String(input.label ?? "").trim().slice(0, 120) || null,
    storage_path: path, file_name: fileName, mime_type: check.mime, size_bytes: bytes.length, created_by: auth.ctx.userId,
  });
  if (error) return fail(dbError(error));
  if (/^\/admin\/[a-z0-9/_-]*$/.test(input.revalidate ?? "")) revalidatePath(input.revalidate);
  return { ok: true, message: `${fileName} attached.` };
}

export async function removeRestrictedDocument(fd: FormData) {
  const id = str(fd, "id", 40), back = str(fd, "back", 200);
  const safeBack = /^\/admin\/[a-zA-Z0-9/_?=&%-]*$/.test(back) ? back : "/admin";
  if (!isUuid(id)) flash(safeBack, "error", "Invalid request.");
  const sb = await createSupabaseServerClient();
  const { data: doc } = await sb.from("restricted_documents").select("id, storage_path").eq("id", id).maybeSingle();
  if (!doc) flash(safeBack, "error", "Document not found.");
  const { data: gone, error } = await sb.from("restricted_documents").delete().eq("id", id).select("id");
  if (error) flash(safeBack, "error", dbError(error));
  if (!gone?.length) flash(safeBack, "error", "Nothing was removed. You may not have permission.");
  await sb.storage.from(BUCKET).remove([doc!.storage_path]);
  flash(safeBack, "ok", "Document removed.");
}
