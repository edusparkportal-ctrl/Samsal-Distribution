/**
 * Pure validation/parsing for the generic admin engine (no Next.js or Supabase imports, so it is
 * unit-testable). Only fields declared in the resource definition are ever read from a form.
 */
import type { ChildList, Field, ResourceDef } from "./resources";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const slugify = (v: string): string =>
  v.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** <input type="datetime-local"> values are entered in Nairobi time (UTC+3, no daylight saving). */
export const fromNairobiInput = (v: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
export const toNairobiInput = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
};

export function checkUrl(raw: string, f: { httpsOnly?: boolean; allowInternal?: boolean }): string | null {
  if (raw.startsWith("/")) return f.allowInternal && !raw.startsWith("//") && !raw.includes("\\") && !/\s/.test(raw) ? raw : null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && !f.httpsOnly)) return null;
    if (u.username || u.password || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type Parsed = { values: Record<string, unknown>; errors: string[] };

export function parseFields(def: ResourceDef, fd: FormData): Parsed {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];
  const raw = (name: string) => {
    const v = fd.get(name);
    return typeof v === "string" ? v.trim() : "";
  };

  for (const f of def.fields) {
    const col = f.col ?? f.name;
    let v = raw(f.name);
    const bad = (msg: string) => void errors.push(`${f.label}: ${msg}`);

    switch (f.type) {
      case "checkbox":
        values[col] = fd.get(f.name) === "on" || fd.get(f.name) === "true";
        continue;
      case "number": {
        if (v === "") { if (f.required) bad("required"); else if (f.default !== undefined) values[col] = f.default; else values[col] = null; continue; }
        const n = Number(v);
        if (!Number.isInteger(n)) { bad("enter a whole number"); continue; }
        if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) { bad(`must be between ${f.min ?? "-∞"} and ${f.max ?? "∞"}`); continue; }
        values[col] = n;
        continue;
      }
      case "select":
        if (v === "" && f.default !== undefined) v = f.default;
        if (v === "") { if (f.required) bad("choose an option"); else values[col] = null; continue; }
        if (!f.options.some((o) => o.value === v)) { bad("not a valid choice"); continue; }
        values[col] = v;
        continue;
      case "relation":
      case "media":
        if (v === "") { if (f.required) bad("required"); else values[col] = null; continue; }
        if (!UUID.test(v)) { bad("invalid selection"); continue; }
        values[col] = v;
        continue;
      case "datetime": {
        if (v === "") { values[col] = null; continue; }
        const iso = fromNairobiInput(v);
        if (!iso) bad("enter a valid date and time"); else values[col] = iso;
        continue;
      }
      case "url": {
        if (v === "") { if (f.required) bad("required"); else values[col] = null; continue; }
        if (f.max && v.length > f.max) { bad(`at most ${f.max} characters`); continue; }
        const ok = checkUrl(v, f);
        if (!ok) bad(f.allowInternal ? "enter a page on this site (like /quote) or a full https:// address" : "enter a full https:// address");
        else values[col] = ok;
        continue;
      }
      case "slug": {
        if (v === "" && def.slugFrom) v = slugify(raw(def.slugFrom));
        v = slugify(v);
        if (v.length < 2) { bad(`could not be made; fill in ${def.slugFrom ?? "this field"} first`); continue; }
        values[col] = v;
        continue;
      }
      case "email":
        if (v === "") { if (f.required) bad("required"); else values[col] = null; continue; }
        if (v.length > 254 || !EMAIL.test(v)) { bad("enter a valid email address"); continue; }
        values[col] = v.toLowerCase();
        continue;
      case "text":
      case "textarea": {
        if (v === "") { if (f.required) bad("required"); else values[col] = null; continue; }
        const max = f.max ?? (f.type === "text" ? 200 : 2000);
        if (v.length > max) { bad(`at most ${max} characters (now ${v.length})`); continue; }
        if (f.type === "text" && f.pattern && !f.pattern.test(v)) { bad(f.patternMessage ?? "invalid format"); continue; }
        if (f.type === "text" && /[\r\n]/.test(v)) { bad("must be a single line"); continue; }
        values[col] = v;
        continue;
      }
    }
  }
  return { values, errors };
}

export type ChildRow = Record<string, string | number>;

export function parseChildLines(c: ChildList, input: string): { rows: ChildRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const max = c.max ?? 30;
  if (lines.length > max) errors.push(`${c.label}: at most ${max} lines`);
  const rows: ChildRow[] = [];
  lines.slice(0, max).forEach((line, i) => {
    if (c.mode === "lines") {
      if (line.length > 300) return void errors.push(`${c.label}, line ${i + 1}: at most 300 characters`);
      rows.push({ [c.textCol!]: line, sort_order: (i + 1) * 10 });
    } else {
      const at = line.indexOf(":");
      const label = at > 0 ? line.slice(0, at).trim() : "";
      const value = at > 0 ? line.slice(at + 1).trim() : "";
      if (!label || !value) return void errors.push(`${c.label}, line ${i + 1}: write it as “Label: Value”`);
      if (label.length > 80 || value.length > 300) return void errors.push(`${c.label}, line ${i + 1}: too long`);
      rows.push({ [c.labelCol!]: label, [c.valueCol!]: value, sort_order: (i + 1) * 10 });
    }
  });
  return { rows, errors };
}

export const formatChildLines = (c: ChildList, rows: Record<string, unknown>[]): string =>
  rows.map((r) => (c.mode === "lines" ? String(r[c.textCol!] ?? "") : `${r[c.labelCol!]}: ${r[c.valueCol!]}`)).join("\n");

/** Parse a list of selected uuids from repeated checkbox values. */
export const parseUuidList = (fd: FormData, name: string): string[] =>
  [...new Set(fd.getAll(name).map(String).filter((v) => UUID.test(v)))];

export const fieldDefault = (f: Field): string | boolean | number | undefined =>
  f.type === "checkbox" ? f.default ?? false : f.type === "number" || f.type === "select" ? f.default : undefined;
