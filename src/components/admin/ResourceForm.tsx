import Link from "next/link";
import type { ResourceDef, Field } from "@/lib/admin/resources";
import { formatChildLines, toNairobiInput } from "@/lib/admin/engine";
import { saveResource } from "@/app/admin/(panel)/website/actions";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Lookups = {
  relations: Record<string, { value: string; label: string }[]>;      // by field name
  media: Record<string, { value: string; label: string }[]>;          // by field name
  mediaUrls: Record<string, string>;                                  // media id -> public URL
  links: Record<string, { value: string; label: string }[]>;          // by link name
  linkSelected: Record<string, string[]>;
  childRows: Record<string, Row[]>;
};

function Control({ f, row, lookups }: { f: Field; row: Row | null; lookups: Lookups }) {
  const col = f.col ?? f.name;
  const id = `f-${f.name}`;
  const cur = row ? row[col] : undefined;
  const req = f.required ? { required: true } : {};

  switch (f.type) {
    case "checkbox":
      return (
        <label className="flex items-center gap-2.5 text-sm text-charcoal">
          <input type="checkbox" name={f.name} defaultChecked={row ? Boolean(cur) : f.default ?? false} className="h-4 w-4 accent-teal" />
          {f.label}
        </label>
      );
    case "textarea":
      return <textarea id={id} name={f.name} rows={f.rows ?? 3} maxLength={f.max} defaultValue={cur ?? ""} className="field-input" {...req} />;
    case "select":
      return (
        <select id={id} name={f.name} defaultValue={cur ?? f.default ?? ""} className="field-input" {...req}>
          {!f.required && <option value="">(none)</option>}
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "relation":
      return (
        <select id={id} name={f.name} defaultValue={cur ?? ""} className="field-input" {...req}>
          <option value="">{f.required ? "Choose…" : "(none)"}</option>
          {(lookups.relations[f.name] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case "media": {
      const url = cur ? lookups.mediaUrls[cur as string] : null;
      return (
        <div className="space-y-2">
          {url && f.kind === "image" && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" className="h-24 w-auto max-w-full rounded border border-grey-200 bg-grey object-contain" />}
          <select id={id} name={f.name} defaultValue={cur ?? ""} className="field-input">
            <option value="">(none)</option>
            {(lookups.media[f.name] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-xs text-grey-500">Pick a file from the <Link href="/admin/website/media" className="font-medium text-teal-dark underline underline-offset-2">Media library</Link>. Upload new files there first.</p>
        </div>
      );
    }
    case "datetime":
      return <input id={id} name={f.name} type="datetime-local" defaultValue={toNairobiInput(cur)} className="field-input" />;
    case "number":
      return <input id={id} name={f.name} type="number" step={1} min={f.min} max={f.max} defaultValue={cur ?? f.default ?? ""} className="field-input" {...req} />;
    case "email":
      return <input id={id} name={f.name} type="email" maxLength={254} defaultValue={cur ?? ""} className="field-input" {...req} />;
    case "url":
      return <input id={id} name={f.name} type="text" inputMode="url" maxLength={f.max ?? 300} defaultValue={cur ?? ""} placeholder={f.allowInternal ? "/page or https://…" : "https://…"} className="field-input" {...req} />;
    default:
      return <input id={id} name={f.name} type="text" maxLength={f.max ?? 200} defaultValue={cur ?? ""} placeholder={"placeholder" in f ? f.placeholder : undefined} className="field-input" {...req} />;
  }
}

export function ResourceForm({ def, row, lookups, cancelHref }: { def: ResourceDef; row: Row | null; lookups: Lookups; cancelHref?: string }) {
  let lastSection: string | undefined;
  const rowKey = row ? String(row[def.pk]) : "";
  return (
    <form action={saveResource} className="space-y-5">
      <input type="hidden" name="resource" value={def.key} />
      <input type="hidden" name="id" value={rowKey} />
      {def.fields.map((f) => {
        const heading = f.section && f.section !== lastSection ? f.section : null;
        if (f.section) lastSection = f.section;
        return (
          <div key={f.name}>
            {heading && <h3 className="mb-3 mt-7 border-b border-grey-200 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-teal-dark first:mt-0">{heading}</h3>}
            {f.type !== "checkbox" && (
              <label htmlFor={`f-${f.name}`} className="field-label">
                {f.label}{f.required && <span className="text-red-700" aria-hidden="true"> *</span>}
              </label>
            )}
            <Control f={f} row={row} lookups={lookups} />
            {f.help && <p className="mt-1 text-xs text-grey-500">{f.help}</p>}
          </div>
        );
      })}

      {(def.children ?? []).map((c) => (
        <div key={c.name}>
          <label htmlFor={`c-${c.name}`} className="field-label">{c.label}</label>
          <textarea id={`c-${c.name}`} name={`child_${c.name}`} rows={6} defaultValue={formatChildLines(c, lookups.childRows[c.name] ?? [])} className="field-input font-mono text-sm" />
          <p className="mt-1 text-xs text-grey-500">{c.help}</p>
        </div>
      ))}

      {(def.links ?? []).map((l) => (
        <fieldset key={l.name}>
          <legend className="field-label">{l.label}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(lookups.links[l.name] ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-2.5 rounded border border-grey-200 px-3 py-2 text-sm has-[:checked]:border-teal has-[:checked]:bg-teal-tint">
                <input type="checkbox" name={`link_${l.name}`} value={o.value} defaultChecked={(lookups.linkSelected[l.name] ?? []).includes(o.value)} className="h-4 w-4 accent-teal" />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap gap-3 pt-2">
        <button className="btn-primary">{def.singleton ? "Save changes" : row ? "Save changes" : `Create ${def.singular.toLowerCase()}`}</button>
        {cancelHref && <Link href={cancelHref} className="btn-outline">Cancel</Link>}
      </div>
    </form>
  );
}
