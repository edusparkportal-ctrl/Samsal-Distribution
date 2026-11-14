import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { Flash } from "@/components/admin/Flash";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { ResourceForm, type Lookups } from "@/components/admin/ResourceForm";
import { RecordDocuments } from "@/components/admin/RecordDocuments";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicMediaUrl } from "@/lib/content/load";
import { resourceBase, type ResourceDef } from "@/lib/admin/resources";
import { deleteResource, moveResource, setResourceActive } from "@/app/admin/(panel)/website/actions";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type SP = { edit?: string; new?: string; ok?: string; error?: string; status?: string };

export type ResourceViewProps = { def: ResourceDef; sp: SP };

/** Generic list / form screen for any resource in the registry (website content and business modules). */
export async function ResourceView({ def, sp }: ResourceViewProps) {
  const ctx = await requirePermission(def.viewPermission ?? def.permission, def.module);
  const canChange = ctx.has(def.permission) || ctx.isSuper;
  const sb = await createSupabaseServerClient();
  const base = resourceBase(def);
  if (!canChange && (sp.new === "1" || sp.edit)) notFound();

  const editing = (def.singleton && canChange) || sp.new === "1" || Boolean(sp.edit);
  let row: Row | null = null;
  if (def.singleton) {
    const { data } = await sb.from(def.table).select("*").eq("id", 1).maybeSingle();
    row = data as Row | null;
  } else if (sp.edit) {
    const { data } = await sb.from(def.table).select("*").eq(def.pk, sp.edit).maybeSingle();
    row = data as Row | null;
    if (!row) notFound();
  }

  const header = (
    <PageHeader
      title={def.singleton ? def.singular : editing ? (row ? `Edit ${def.singular.toLowerCase()}` : (def.newLabel ?? `New ${def.singular.toLowerCase()}`)) : def.label}
      description={def.description}
      actions={canChange && !def.singleton && !editing && <Link href={`${base}?new=1`} className="btn-primary"><Plus aria-hidden="true" size={16} /> {def.newLabel ?? `Add ${def.singular.toLowerCase()}`}</Link>}
    />
  );

  /* ---------- form (create / edit / singleton) ---------- */
  if (editing) {
    const lookups = await loadLookups(sb, def, row);
    return (
      <>
        {header}
        <Flash ok={sp.ok} error={sp.error} />
        {!def.singleton && <p className="mb-4 text-sm"><Link href={base} className="font-medium text-teal-dark underline underline-offset-2">← Back to {def.label.toLowerCase()}</Link></p>}
        {def.singleton && !row ? (
          <Panel><p className="text-sm text-charcoal">The settings row does not exist yet. Run <code>supabase/seed.sql</code> as described in docs/SUPABASE_SETUP.md.</p></Panel>
        ) : (
          <Panel className="max-w-3xl"><ResourceForm def={def} row={row} lookups={lookups} cancelHref={def.singleton ? undefined : base} /></Panel>
        )}
        {row && def.documentType && <RecordDocuments entityType={def.documentType} entityId={String(row[def.pk])} canManage={canChange} backPath={`${base}?edit=${encodeURIComponent(String(row[def.pk]))}`} />}
      </>
    );
  }

  /* ---------- list ---------- */
  let q = sb.from(def.table).select("*").order(def.orderBy, { ascending: def.orderBy !== "created_at" });
  if (def.softDelete) q = q.is(def.softDelete, null);
  if (def.filterStatus && sp.status) q = q.eq("status", sp.status);
  const { data } = await q.limit(500);
  const rows = (data ?? []) as Row[];
  // Show names instead of ids for columns that point at another table.
  const names: Record<string, Record<string, string>> = {};
  for (const col of def.columns) {
    if (!col.lookup) continue;
    const ids = [...new Set(rows.map((r) => r[col.key]).filter(Boolean))] as string[];
    if (!ids.length) continue;
    const { data: found } = await sb.from(col.lookup.table).select(`id, ${col.lookup.labelCol}`).in("id", ids);
    names[col.key] = Object.fromEntries(((found ?? []) as unknown as Row[]).map((o) => [o.id, String(o[col.lookup!.labelCol])]));
  }

  return (
    <>
      {header}
      <Flash ok={sp.ok} error={sp.error} />
      {def.filterStatus && (
        <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2 text-sm">
          {[["", "All"], ...(def.statusOptions ?? [{ value: "published", label: "Published" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" }]).map((o) => [o.value, o.label])].map(([v, l]) => (
            <Link key={v} href={v ? `${base}?status=${v}` : base} className={`rounded-full border px-3 py-1 ${(sp.status ?? "") === v ? "border-navy bg-navy text-white" : "border-grey-300 text-charcoal hover:bg-grey"}`}>{l}</Link>
          ))}
        </nav>
      )}
      <Panel className="p-0 sm:p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-grey-500">Nothing here yet. {canChange && def.newLabel && <Link href={`${base}?new=1`} className="font-medium text-teal-dark underline underline-offset-2">{def.newLabel}</Link>}</p>
        ) : (
          <ul className="divide-y divide-grey-200">
            {rows.map((r, idx) => {
              const key = String(r[def.pk]);
              const active = def.activeColumn ? Boolean(r[def.activeColumn]) : true;
              return (
                <li key={key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {def.columns.map((c, i) => {
                        const v = r[c.key];
                        const text = typeof v === "boolean" ? (v ? "Yes" : "—") : v == null || v === "" ? "—" : c.lookup ? names[c.key]?.[v] ?? "—" : /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? String(v).slice(0, 16).replace("T", " ") : String(v);
                        return (
                          <span key={c.key} className={i === 0 ? "font-semibold text-navy" : "text-sm text-charcoal"}>
                            {i > 0 && <span className="mr-1 text-xs text-grey-500">{c.label}:</span>}
                            {c.badge && typeof v === "string" ? <Badge tone={c.badge[v] ?? "grey"}>{text}</Badge> : <span className="break-words">{text.length > 90 ? text.slice(0, 90) + "…" : text}</span>}
                          </span>
                        );
                      })}
                      {def.activeColumn && !active && <Badge tone="amber">Hidden</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canChange && def.sortable && (
                      <>
                        <form action={moveResource}><input type="hidden" name="resource" value={def.key} /><input type="hidden" name="id" value={key} /><input type="hidden" name="dir" value="up" />
                          <button disabled={idx === 0} aria-label={`Move ${def.singular.toLowerCase()} up`} className="rounded border border-grey-300 p-1.5 text-navy hover:bg-grey disabled:opacity-30"><ArrowUp size={15} /></button></form>
                        <form action={moveResource}><input type="hidden" name="resource" value={def.key} /><input type="hidden" name="id" value={key} /><input type="hidden" name="dir" value="down" />
                          <button disabled={idx === rows.length - 1} aria-label={`Move ${def.singular.toLowerCase()} down`} className="rounded border border-grey-300 p-1.5 text-navy hover:bg-grey disabled:opacity-30"><ArrowDown size={15} /></button></form>
                      </>
                    )}
                    {canChange && def.activeColumn && (
                      <form action={setResourceActive}><input type="hidden" name="resource" value={def.key} /><input type="hidden" name="id" value={key} /><input type="hidden" name="to" value={active ? "false" : "true"} />
                        <button className="rounded border border-grey-300 px-3 py-1.5 text-sm font-medium text-navy hover:bg-grey">{active ? "Hide" : "Show"}</button></form>
                    )}
                    {canChange && !def.createOnly && <Link href={`${base}?edit=${encodeURIComponent(key)}`} className="inline-flex items-center gap-1.5 rounded border border-navy px-3 py-1.5 text-sm font-medium text-navy hover:bg-navy hover:text-white"><Pencil aria-hidden="true" size={14} /> Edit</Link>}
                    {canChange && !def.noDelete && !def.createOnly && <form action={deleteResource}><input type="hidden" name="resource" value={def.key} /><input type="hidden" name="id" value={key} />
                      <ConfirmButton message={`Delete this ${def.singular.toLowerCase()}? ${def.publicSite === false ? "" : "This removes it from the website."}`} className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Delete</ConfirmButton></form>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

type Sb = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Loads dropdown options, current links and child rows needed by the form. Table names come from the registry only. */
async function loadLookups(sb: Sb, def: ResourceDef, row: Row | null): Promise<Lookups> {
  const lookups: Lookups = { relations: {}, media: {}, mediaUrls: {}, links: {}, linkSelected: {}, childRows: {} };

  for (const f of def.fields) {
    if (f.type === "relation") {
      const { data } = await sb.from(f.table).select(`id, ${f.labelCol}`).order(f.orderBy ?? f.labelCol).limit(500);
      lookups.relations[f.name] = ((data ?? []) as unknown as Row[]).map((o) => ({ value: o.id, label: String(o[f.labelCol]) }));
    }
    if (f.type === "media") {
      const { data } = await sb.from("media_assets").select("id, title, file_name, folder, mime_type, bucket, storage_path, alt_text").eq("bucket", "public-media").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
      const list = ((data ?? []) as Row[]).filter((m) => (f.kind === "image" ? String(m.mime_type).startsWith("image/") : true));
      lookups.media[f.name] = list.map((m) => ({ value: m.id, label: `${m.folder} / ${m.title || m.file_name}` }));
      list.forEach((m) => { const u = publicMediaUrl(m as never); if (u) lookups.mediaUrls[m.id] = u; });
    }
  }
  for (const l of def.links ?? []) {
    const { data } = await sb.from(l.optionsTable).select(`id, ${l.optionLabel}`).order(l.optionLabel);
    lookups.links[l.name] = ((data ?? []) as unknown as Row[]).map((o) => ({ value: o.id, label: String(o[l.optionLabel]) }));
    if (row) {
      const { data: cur } = await sb.from(l.table).select(l.other).eq(l.fk, row[def.pk]);
      lookups.linkSelected[l.name] = ((cur ?? []) as unknown as Row[]).map((c) => c[l.other]);
    }
  }
  if (row) {
    for (const c of def.children ?? []) {
      const { data } = await sb.from(c.table).select("*").eq(c.fk, row[def.pk]).order(c.mode === "items" ? "line_no" : "sort_order");
      lookups.childRows[c.name] = (data ?? []) as Row[];
    }
  }
  return lookups;
}
