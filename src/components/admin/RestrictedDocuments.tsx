import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { RestrictedDocUploader } from "@/components/admin/RestrictedDocUploader";
import { Panel } from "@/components/admin/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RESTRICTED_ENTITIES, type RestrictedEntity } from "@/lib/restricted-docs";
import { removeRestrictedDocument } from "@/app/admin/(panel)/documents/restricted/actions";

/** Restricted HR / Finance documents for one record. Shows only what the database lets this person see. Every open is logged. */
export async function RestrictedDocuments({ entityType, entityId, backPath }: { entityType: RestrictedEntity; entityId: string; backPath: string }) {
  const sb = await createSupabaseServerClient();
  const { data } = await sb.from("restricted_documents").select("id, label, file_name, size_bytes, created_at").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false });
  const rows = (data ?? []) as { id: string; label: string | null; file_name: string; size_bytes: number }[];
  // Whether this person may add or remove is decided by the database; the buttons only reflect it.
  const { data: canAdd } = await sb.rpc("restricted_doc_can", { p_entity: entityType, p_entity_id: entityId, p_mode: "add" });
  const { data: canRemove } = await sb.rpc("restricted_doc_can", { p_entity: entityType, p_entity_id: entityId, p_mode: "remove" });
  if (!canAdd && rows.length === 0) return null;
  return (
    <Panel title="Restricted documents" className="mt-6 max-w-3xl">
      <p className="mb-3 text-xs text-grey-500">Confidential. Stored separately from other company documents and visible only to staff authorised for this {RESTRICTED_ENTITIES[entityType].label}. Each time a file is opened it is recorded in the activity log.</p>
      <ul className="divide-y divide-grey-200">
        {rows.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span><a href={`/admin/documents/restricted/${d.id}`} className="font-medium text-teal-dark hover:underline">{d.label || d.file_name}</a> <span className="text-xs text-grey-500">{d.file_name} · {Math.max(1, Math.round(d.size_bytes / 1024))} KB</span></span>
            {canRemove && <form action={removeRestrictedDocument}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="back" value={backPath} /><ConfirmButton message="Remove this document?" className="text-xs text-red-700 hover:underline">Remove</ConfirmButton></form>}
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-sm text-grey-500">No documents attached.</li>}
      </ul>
      {canAdd && <div className="mt-4 border-t border-grey-200 pt-4"><RestrictedDocUploader entityType={entityType} entityId={entityId} revalidate={backPath.split("?")[0]} /></div>}
    </Panel>
  );
}
