import Link from "next/link";
import { FileText } from "lucide-react";
import { Flash } from "@/components/admin/Flash";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicMediaUrl } from "@/lib/content/load";
import { deleteMedia, updateMedia } from "./actions";

export const metadata = { title: "Media library" };

type Asset = { id: string; storage_path: string; file_name: string; title: string | null; alt_text: string | null; description: string | null; folder: string; mime_type: string; size_bytes: number; created_at: string; bucket: string };

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; folder?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("media.view", "website");
  const canManage = ctx.has("media.manage");
  const sb = await createSupabaseServerClient();
  let query = sb.from("media_assets").select("*").eq("bucket", "public-media").is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (sp.folder) query = query.eq("folder", sp.folder);
  const { data } = await query;
  const { data: allFolders } = await sb.from("media_assets").select("folder").eq("bucket", "public-media").is("deleted_at", null);
  const folders: string[] = [...new Set<string>((allFolders ?? []).map((f: { folder: string }) => f.folder))].sort();
  const q = (sp.q ?? "").trim().toLowerCase();
  const assets = ((data ?? []) as Asset[]).filter((a) => !q || `${a.title ?? ""} ${a.file_name} ${a.alt_text ?? ""}`.toLowerCase().includes(q));

  return (
    <>
      <PageHeader title="Media library" description="Images and approved public documents used on the website. Replacing a file updates it everywhere it is used. Files in use cannot be deleted." />
      <Flash ok={sp.ok} error={sp.error} />
      {canManage && <Panel title="Upload a file" className="mb-6 max-w-3xl"><MediaUploader folders={folders} /></Panel>}

      <form className="mb-4 flex flex-wrap items-end gap-3" action="/admin/website/media">
        <div><label className="field-label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={sp.q ?? ""} className="field-input" /></div>
        <div><label className="field-label" htmlFor="fo">Folder</label>
          <select id="fo" name="folder" defaultValue={sp.folder ?? ""} className="field-input"><option value="">All folders</option>{folders.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
        <button className="btn-outline">Filter</button>
      </form>

      {assets.length === 0 ? <Panel><p className="text-sm text-grey-500">No files yet.</p></Panel> : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => {
            const url = publicMediaUrl(a as never);
            const isImage = a.mime_type.startsWith("image/");
            return (
              <li key={a.id} className="card flex flex-col overflow-hidden">
                <div className="flex h-40 items-center justify-center bg-grey">
                  {isImage && url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt={a.alt_text ?? ""} className="max-h-full max-w-full object-contain" /> : <FileText aria-hidden="true" size={48} className="text-grey-500" />}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="break-all font-semibold text-navy">{a.title || a.file_name}</p>
                  <p className="text-xs text-grey-500">{a.folder} · {a.mime_type.split("/")[1]} · {(a.size_bytes / 1024).toFixed(0)} KB · {new Date(a.created_at).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
                  {url && <p className="text-xs"><Link href={url} target="_blank" rel="noopener" className="font-medium text-teal-dark underline underline-offset-2">Open file</Link></p>}
                  {canManage && (
                    <details className="mt-auto pt-2 text-sm">
                      <summary className="cursor-pointer font-medium text-teal-dark">Edit, replace or delete</summary>
                      <form action={updateMedia} className="mt-3 space-y-3">
                        <input type="hidden" name="id" value={a.id} />
                        <div><label className="field-label" htmlFor={`t-${a.id}`}>Title</label><input id={`t-${a.id}`} name="title" defaultValue={a.title ?? ""} maxLength={120} className="field-input" /></div>
                        <div><label className="field-label" htmlFor={`a-${a.id}`}>Image description</label><input id={`a-${a.id}`} name="alt_text" defaultValue={a.alt_text ?? ""} maxLength={200} className="field-input" /></div>
                        <div><label className="field-label" htmlFor={`d-${a.id}`}>Notes</label><input id={`d-${a.id}`} name="description" defaultValue={a.description ?? ""} maxLength={500} className="field-input" /></div>
                        <div><label className="field-label" htmlFor={`f-${a.id}`}>Folder</label><input id={`f-${a.id}`} name="folder" defaultValue={a.folder} pattern="[a-z0-9_\-]{1,40}" className="field-input" /></div>
                        <button className="btn-outline px-4 py-2 text-sm">Save details</button>
                      </form>
                      <div className="mt-4 border-t border-grey-200 pt-4"><MediaUploader folders={folders} replaceId={a.id} compact /></div>
                      <form action={deleteMedia} className="mt-4 border-t border-grey-200 pt-4"><input type="hidden" name="id" value={a.id} />
                        <ConfirmButton message="Delete this file? It will be removed from the library and from storage." className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Delete file</ConfirmButton></form>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
