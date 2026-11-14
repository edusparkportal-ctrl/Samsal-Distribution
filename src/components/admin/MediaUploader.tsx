"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BUCKETS, buildStoragePath, precheck } from "@/lib/media";
import { registerUpload } from "@/app/admin/(panel)/website/media/actions";

/**
 * Uploads straight to Supabase Storage (so large files bypass the server's body limit), then asks the
 * server to verify and register the file. Used for new uploads and for replacing a file.
 */
export function MediaUploader({ folders, replaceId, compact = false }: { folders: string[]; replaceId?: string; compact?: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const rule = BUCKETS["public-media"];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return setStatus({ kind: "error", text: "Choose a file first." });
    const folder = String(fd.get("folder") || "general");
    const problem = precheck("public-media", file.name, file.size);
    if (problem) return setStatus({ kind: "error", text: problem });
    setStatus(null);

    start(async () => {
      try {
        const sb = createSupabaseBrowserClient();
        const path = buildStoragePath(folder, file.name, crypto.randomUUID());
        const up = await sb.storage.from("public-media").upload(path, file, { upsert: false, cacheControl: "31536000" });
        if (up.error) return setStatus({ kind: "error", text: "Upload failed. You may not have permission, or the file type or size is not allowed." });
        const res = await registerUpload({
          path, originalName: file.name, folder,
          title: String(fd.get("title") || ""), alt: String(fd.get("alt") || ""), description: String(fd.get("description") || ""),
          replaceId,
        });
        if (!res.ok) return setStatus({ kind: "error", text: res.error });
        setStatus({ kind: "ok", text: res.message });
        formRef.current?.reset();
        router.refresh();
      } catch {
        setStatus({ kind: "error", text: "Upload failed. Check your connection and try again." });
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="field-label" htmlFor={`file-${replaceId ?? "new"}`}>{replaceId ? "Replacement file" : "File"}</label>
        <input id={`file-${replaceId ?? "new"}`} name="file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" required className="field-input file:mr-3 file:rounded file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" />
        <p className="mt-1 text-xs text-grey-500">{rule.label}. Use descriptive file names, such as “floor-cleaner-5-litre.jpg”.</p>
      </div>
      {!replaceId && !compact && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="field-label" htmlFor="u-title">Title</label><input id="u-title" name="title" maxLength={120} className="field-input" /></div>
          <div>
            <label className="field-label" htmlFor="u-folder">Folder</label>
            <input id="u-folder" name="folder" list="folder-list" defaultValue="general" pattern="[a-z0-9_\-]{1,40}" maxLength={40} className="field-input" />
            <datalist id="folder-list">{["general", "products", "staff", "hero", "documents", "seo", ...folders].filter((v, i, a) => a.indexOf(v) === i).map((f) => <option key={f} value={f} />)}</datalist>
          </div>
          <div className="sm:col-span-2"><label className="field-label" htmlFor="u-alt">Image description (for screen readers)</label><input id="u-alt" name="alt" maxLength={200} className="field-input" /></div>
        </div>
      )}
      {(replaceId || compact) && <input type="hidden" name="folder" value="general" />}
      {status && <p role={status.kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${status.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-900"}`}>{status.text}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">{pending ? "Uploading…" : replaceId ? "Replace file" : "Upload"}</button>
    </form>
  );
}
