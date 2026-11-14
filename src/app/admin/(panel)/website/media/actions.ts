"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FOLDER_RE, STORAGE_PATH_RE, extensionOf, inspectBytes } from "@/lib/media";
import { dbError, flash, isUuid, optStr, str } from "@/lib/admin/forms";

const PATH = "/admin/website/media";
const BUCKET = "public-media" as const;

export type UploadResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Called after the browser has uploaded a file straight to Storage. The server does NOT trust the
 * browser's claims: it downloads the stored object, checks its size and real bytes, and only then
 * records it in the library. Invalid uploads are deleted again.
 */
export async function registerUpload(input: {
  path: string; originalName: string; folder: string; title: string; alt: string; description: string; replaceId?: string;
}): Promise<UploadResult> {
  const auth = await checkPermission("media.manage");
  if (!auth.ok) return { ok: false, error: auth.error };
  const sb = await createSupabaseServerClient();

  const path = String(input.path ?? "");
  const folder = String(input.folder ?? "");
  // The path must be one this app generates, and sit in the folder the user chose.
  if (!STORAGE_PATH_RE.test(path) || !FOLDER_RE.test(folder) || !path.startsWith(`${folder}/`)) return { ok: false, error: "Invalid upload." };
  const fail = async (error: string): Promise<UploadResult> => {
    await sb.storage.from(BUCKET).remove([path]);
    return { ok: false, error };
  };

  const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(path);
  if (dlErr || !blob) return { ok: false, error: "The uploaded file could not be found. Please try again." };
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const stored = path.slice(path.lastIndexOf("/") + 1);
  const check = inspectBytes(BUCKET, stored, bytes);
  if (!check.ok) return fail(check.error);

  const fileName = String(input.originalName ?? "").split(/[\\/]/).pop()!.slice(0, 200) || stored;
  if (extensionOf(fileName) !== check.ext) return fail("The file name does not match the file type.");
  const meta = {
    title: String(input.title ?? "").trim().slice(0, 120) || null,
    alt_text: String(input.alt ?? "").trim().slice(0, 200) || null,
    description: String(input.description ?? "").trim().slice(0, 500) || null,
  };

  if (input.replaceId) {
    if (!isUuid(input.replaceId)) return fail("Invalid request.");
    const { data: old } = await sb.from("media_assets").select("storage_path").eq("id", input.replaceId).is("deleted_at", null).maybeSingle();
    if (!old) return fail("The file being replaced no longer exists.");
    const { error } = await sb.from("media_assets").update({ storage_path: path, file_name: fileName, mime_type: check.mime, size_bytes: bytes.length }).eq("id", input.replaceId);
    if (error) return fail(dbError(error));
    await sb.storage.from(BUCKET).remove([old.storage_path]);
    revalidatePath(PATH); revalidateTag("cms"); revalidatePath("/", "layout");
    return { ok: true, message: "File replaced everywhere it is used." };
  }

  const { error } = await sb.from("media_assets").insert({
    bucket: BUCKET, storage_path: path, file_name: fileName, folder, mime_type: check.mime, size_bytes: bytes.length,
    uploaded_by: auth.ctx.userId, ...meta,
  });
  if (error) return fail(dbError(error));
  revalidatePath(PATH);
  return { ok: true, message: `${fileName} uploaded.` };
}

export async function updateMedia(formData: FormData) {
  const auth = await checkPermission("media.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const id = str(formData, "id", 40);
  const folder = str(formData, "folder", 40) || "general";
  if (!isUuid(id) || !FOLDER_RE.test(folder)) flash(PATH, "error", "Invalid request. Folders use lower-case letters, digits, dashes and underscores.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from("media_assets").update({ title: optStr(formData, "title", 120), alt_text: optStr(formData, "alt_text", 200), description: optStr(formData, "description", 500), folder }).eq("id", id);
  if (error) flash(PATH, "error", dbError(error));
  revalidatePath(PATH); revalidateTag("cms"); revalidatePath("/", "layout");
  flash(PATH, "ok", "Details saved.");
}

/** Where a file is used (blocks deleting a file the website still shows). */
const USAGE: [table: string, column: string, label: string][] = [
  ["products", "photo_media_id", "a product"], ["staff_members", "photo_media_id", "a team member"], ["company_settings", "logo_media_id", "the company logo"],
  ["homepage_settings", "hero_media_id", "the homepage"], ["site_documents", "media_id", "a download"], ["seo_pages", "og_image_media_id", "page SEO"],
  ["record_documents", "media_id", "a business record"],
];

export async function deleteMedia(formData: FormData) {
  const auth = await checkPermission("media.manage");
  if (!auth.ok) flash(PATH, "error", auth.error);
  const id = str(formData, "id", 40);
  if (!isUuid(id)) flash(PATH, "error", "Invalid request.");
  const sb = await createSupabaseServerClient();
  const used: string[] = [];
  for (const [table, column, label] of USAGE) {
    const { count } = await sb.from(table).select("id", { count: "exact", head: true }).eq(column, id);
    if ((count ?? 0) > 0) used.push(`${label} (${count})`);
  }
  if (used.length) flash(PATH, "error", `This file is still used by ${used.join(", ")}. Remove it from there first.`);
  const { data: row } = await sb.from("media_assets").select("storage_path").eq("id", id).maybeSingle();
  const { error } = await sb.from("media_assets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) flash(PATH, "error", dbError(error));
  if (row?.storage_path) await sb.storage.from(BUCKET).remove([row.storage_path]);
  revalidatePath(PATH);
  flash(PATH, "ok", "File deleted.");
}
