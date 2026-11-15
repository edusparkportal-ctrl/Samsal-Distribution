"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { checkPermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RESOURCES, resourceBase, type ResourceDef } from "@/lib/admin/resources";
import { parseChildLines, parseFields, parseUuidList } from "@/lib/admin/engine";
import { dbError, flash, str } from "@/lib/admin/forms";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const listPath = (d: ResourceDef) => resourceBase(d);
const editPath = (d: ResourceDef, id: string) => `${listPath(d)}?edit=${encodeURIComponent(id)}`;

/** Make saved changes visible on the public site straight away. */
function purgePublicSite(def?: ResourceDef) {
  if (def && def.publicSite === false) return;
  revalidateTag("cms");
  revalidatePath("/", "layout");
}

async function authorise(formData: FormData) {
  const def = RESOURCES[str(formData, "resource", 40)];
  if (!def) flash("/admin", "error", "Unknown item type.");
  const auth = await checkPermission(def!.permission, def!.module);
  if (!auth.ok) flash(listPath(def!), "error", auth.error);
  return { def: def!, ctx: auth.ctx };
}

export async function saveResource(formData: FormData) {
  const { def, ctx } = await authorise(formData);
  const id = str(formData, "id", 200);
  const isNew = !def.singleton && id === "";
  if (def.createOnly && !isNew) flash(listPath(def), "error", "These records cannot be edited. Record an adjustment instead.");
  const back = (kind: "ok" | "error", msg: string, rowId?: string) =>
    flash(def.singleton ? listPath(def) : rowId ? editPath(def, rowId) : isNew ? `${listPath(def)}?new=1` : editPath(def, id), kind, msg);

  const { values, errors } = parseFields(def, formData);
  if (def.beforeSave && errors.length === 0) {
    try { def.beforeSave(values); } catch (e) { errors.push(e instanceof Error ? e.message : "Invalid values."); }
  }
  const childParsed = (def.children ?? []).map((c) => ({ c, ...parseChildLines(c, str(formData, `child_${c.name}`, 20000)) }));
  errors.push(...childParsed.flatMap((p) => p.errors));
  if (errors.length) back("error", errors.slice(0, 4).join(" · ") + (errors.length > 4 ? ` · and ${errors.length - 4} more` : ""));

  const sb = await createSupabaseServerClient();
  const stamp: Row = {};
  if (def.singleton) stamp.updated_by = ctx.userId;
  if ((def.table === "products" || def.createdBy) && isNew) stamp[def.createdBy ?? "created_by"] = ctx.userId;

  let rowId = id;
  if (def.singleton) {
    const { data, error } = await sb.from(def.table).update({ ...values, ...stamp }).eq("id", 1).select("id");
    if (error) back("error", dbError(error));
    if (!data?.length) back("error", "The settings row is missing or you may not change it. Run supabase/seed.sql (see docs/SUPABASE_SETUP.md).");
  } else if (isNew) {
    if (def.sortable) {
      const { data: last } = await sb.from(def.table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
      values.sort_order = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 10;
    }
    const { data, error } = await sb.from(def.table).insert({ ...values, ...stamp }).select(def.pk).single();
    if (error) back("error", dbError(error));
    rowId = String((data as Row)[def.pk]);
  } else {
    const { data, error } = await sb.from(def.table).update({ ...values, ...stamp }).eq(def.pk, id).select(def.pk);
    if (error) back("error", dbError(error), id);
    if (!data?.length) back("error", "That item no longer exists, or you may not change it.", id);
    if (def.pk === "path") rowId = String(values.path);
  }

  // Child lists (e.g. specifications): insert the new rows first, then remove the old ones, so a failed insert never loses data.
  for (const { c, rows } of childParsed) {
    if (def.singleton) continue;
    const { data: old } = await sb.from(c.table).select("id").eq(c.fk, rowId);
    // Numbered lines are unique per parent: park the new set at +1000, then renumber after removing the old rows.
    const OFFSET = 1000;
    if (rows.length) {
      const { error } = await sb.from(c.table).insert(rows.map((r) => ({ ...r, [c.fk]: rowId, ...(c.mode === "items" ? { line_no: Number(r.line_no) + OFFSET } : {}) })));
      if (error) back("error", `Saved, but “${c.label}” could not be updated: ${dbError(error)}`, rowId);
    }
    const oldIds = (old ?? []).map((o: Row) => o.id);
    if (oldIds.length) {
      const { error } = await sb.from(c.table).delete().in("id", oldIds);
      if (error) back("error", `Saved, but old “${c.label}” entries could not be removed: ${dbError(error)}`, rowId);
    }
    if (c.mode === "items" && rows.length) {
      const { data: fresh } = await sb.from(c.table).select("id, line_no").eq(c.fk, rowId);
      for (const f of (fresh ?? []) as Row[]) await sb.from(c.table).update({ line_no: Number(f.line_no) - OFFSET }).eq("id", f.id);
    }
  }

  // Many-to-many links (e.g. industry <-> categories): add what is new, remove what was unticked.
  for (const l of def.links ?? []) {
    const wanted = new Set(parseUuidList(formData, `link_${l.name}`));
    const { data: current } = await sb.from(l.table).select(l.other).eq(l.fk, rowId);
    const have = new Set<string>((current ?? []).map((r: Row) => r[l.other] as string));
    const add = [...wanted].filter((x) => !have.has(x));
    const remove = [...have].filter((x) => !wanted.has(x));
    if (add.length) {
      const { error } = await sb.from(l.table).insert(add.map((o, i) => ({ [l.fk]: rowId, [l.other]: o, ...(l.noSort ? {} : { sort_order: (have.size + i + 1) * 10 }) })));
      if (error) back("error", `Saved, but “${l.label}” could not be updated: ${dbError(error)}`, rowId);
    }
    if (remove.length) {
      const { error } = await sb.from(l.table).delete().eq(l.fk, rowId).in(l.other, remove);
      if (error) back("error", `Saved, but “${l.label}” could not be updated: ${dbError(error)}`, rowId);
    }
  }

  purgePublicSite(def);
  revalidatePath(listPath(def));
  flash(def.singleton ? listPath(def) : editPath(def, rowId), "ok", `${def.singular} saved. The website now shows the change.`);
}

export async function deleteResource(formData: FormData) {
  const { def } = await authorise(formData);
  const id = str(formData, "id", 200);
  if (def.singleton || !id || def.noDelete || def.createOnly) flash(listPath(def), "error", "That cannot be deleted.");
  const sb = await createSupabaseServerClient();
  const { data: gone, error } = def.softDelete
    ? await sb.from(def.table).update({ [def.softDelete]: new Date().toISOString() }).eq(def.pk, id).select(def.pk)
    : await sb.from(def.table).delete().eq(def.pk, id).select(def.pk);
  if (error) flash(listPath(def), "error", dbError(error));
  if (!gone?.length) flash(listPath(def), "error", "Nothing was deleted. You may not have permission to delete this.");
  purgePublicSite(def);
  revalidatePath(listPath(def));
  flash(listPath(def), "ok", `${def.singular} deleted.`);
}

export async function setResourceActive(formData: FormData) {
  const { def } = await authorise(formData);
  const id = str(formData, "id", 200);
  if (!def.activeColumn || !id) flash(listPath(def), "error", "That cannot be switched.");
  const sb = await createSupabaseServerClient();
  const { error } = await sb.from(def.table).update({ [def.activeColumn!]: str(formData, "to", 5) === "true" }).eq(def.pk, id);
  if (error) flash(listPath(def), "error", dbError(error));
  purgePublicSite(def);
  revalidatePath(listPath(def));
  flash(listPath(def), "ok", "Updated.");
}

/** Move an item up or down in the display order. */
export async function moveResource(formData: FormData) {
  const { def } = await authorise(formData);
  const id = str(formData, "id", 200);
  const dir = str(formData, "dir", 4);
  if (!def.sortable || !id || (dir !== "up" && dir !== "down")) flash(listPath(def), "error", "That cannot be reordered.");
  const sb = await createSupabaseServerClient();
  let q = sb.from(def.table).select(`${def.pk}, sort_order`).order("sort_order").order("created_at");
  if (def.softDelete) q = q.is(def.softDelete, null);
  const { data, error } = await q;
  if (error) flash(listPath(def), "error", dbError(error));
  const rows = (data ?? []) as unknown as Row[];
  const i = rows.findIndex((r) => String(r[def.pk]) === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) flash(listPath(def), "ok", "Already at the end of the list.");
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k++) {
    const want = (k + 1) * 10;
    if (rows[k].sort_order !== want) {
      const { error: e } = await sb.from(def.table).update({ sort_order: want }).eq(def.pk, rows[k][def.pk]);
      if (e) flash(listPath(def), "error", dbError(e));
    }
  }
  purgePublicSite(def);
  revalidatePath(listPath(def));
  flash(listPath(def), "ok", "Order updated.");
}
