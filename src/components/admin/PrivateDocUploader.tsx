"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BUCKETS, buildStoragePath, precheck } from "@/lib/media";
import { registerRecordDocument } from "@/app/admin/(panel)/documents/actions";

/** Browser -> private Storage bucket directly, then the server verifies the real file bytes and links it to the record. */
export function PrivateDocUploader({ entityType, entityId, revalidate }: { entityType: string; entityId: string; revalidate: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return setMsg({ ok: false, text: "Choose a file first." });
    const problem = precheck("private-docs", file.name, file.size);
    if (problem) return setMsg({ ok: false, text: problem });
    setMsg(null);
    start(async () => {
      try {
        const path = buildStoragePath(entityType, file.name, crypto.randomUUID());
        const up = await createSupabaseBrowserClient().storage.from("private-docs").upload(path, file, { upsert: false });
        if (up.error) return setMsg({ ok: false, text: "Upload failed. You may not have permission, or the file type or size is not allowed." });
        const res = await registerRecordDocument({ path, originalName: file.name, entityType, entityId, label: String(fd.get("label") || ""), revalidate });
        setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
        if (res.ok) { ref.current?.reset(); router.refresh(); }
      } catch {
        setMsg({ ok: false, text: "Upload failed. Check your connection and try again." });
      }
    });
  }
  return (
    <form ref={ref} onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="doc-file" className="field-label">Add a document</label><input id="doc-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.csv,.txt" required className="field-input" /></div>
        <div><label htmlFor="doc-label" className="field-label">Label (optional)</label><input id="doc-label" name="label" maxLength={120} className="field-input" /></div>
      </div>
      <p className="text-xs text-grey-500">{BUCKETS["private-docs"].label}.</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-md border px-3 py-2 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <button disabled={pending} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">{pending ? "Uploading…" : "Attach"}</button>
    </form>
  );
}
