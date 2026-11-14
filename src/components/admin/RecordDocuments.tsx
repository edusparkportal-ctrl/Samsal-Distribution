import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { PrivateDocUploader } from "@/components/admin/PrivateDocUploader";
import { Panel } from "@/components/admin/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DOC_ENTITIES, type DocEntity } from "@/lib/record-docs";
import { removeRecordDocument } from "@/app/admin/(panel)/documents/actions";

/** Private documents attached to a record (supplier price lists, PO copies, tender documents…). Downloads are permission-checked and short-lived. */
export async function RecordDocuments({ entityType, entityId, canManage, backPath }: { entityType: DocEntity; entityId: string; canManage: boolean; backPath: string }) {
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("record_documents").select("id, label, created_at, media:media_assets(file_name, size_bytes)").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; label: string | null; created_at: string; media: { file_name: string; size_bytes: number } | { file_name: string; size_bytes: number }[] | null }[];
  return (
    <Panel title="Documents" className="mt-6 max-w-3xl">
      <p className="mb-3 text-xs text-grey-500">Private to staff with access to this {DOC_ENTITIES[entityType].label}. Files open through a short-lived secure link.</p>
      <ul className="divide-y divide-grey-200">
        {rows.map((d) => {
          const m = Array.isArray(d.media) ? d.media[0] : d.media;
          return (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span><a href={`/admin/documents/${d.id}`} className="font-medium text-teal-dark hover:underline">{d.label || m?.file_name}</a> <span className="text-xs text-grey-500">{m?.file_name} · {m ? `${Math.max(1, Math.round(m.size_bytes / 1024))} KB` : ""}</span></span>
              {canManage && <form action={removeRecordDocument}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={backPath} /><ConfirmButton message="Remove this document?" className="text-xs text-red-700 hover:underline">Remove</ConfirmButton></form>}
            </li>
          );
        })}
        {rows.length === 0 && <li className="py-2 text-sm text-grey-500">No documents attached.</li>}
      </ul>
      {canManage && <div className="mt-4 border-t border-grey-200 pt-4"><PrivateDocUploader entityType={entityType} entityId={entityId} revalidate={backPath.split("?")[0]} /></div>}
    </Panel>
  );
}
