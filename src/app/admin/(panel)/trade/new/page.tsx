import { notFound } from "next/navigation";
import { Flash } from "@/components/admin/Flash";
import { requirePermission } from "@/lib/auth/session";
import { isUuid } from "@/lib/admin/forms";
import { TradeHeader } from "../TradeHeader";
import { DocForm } from "../DocForm";
import { loadFormLists, loadTypes } from "../data";

export const metadata = { title: "New trade document" };
export const dynamic = "force-dynamic";

export default async function NewDoc({ searchParams }: { searchParams: Promise<{ type?: string; parent?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("trade.view", "trade");
  const types = await loadTypes();
  const type = types.find((t) => t.key === sp.type);
  if (!type) notFound();
  if (!ctx.isSuper && !ctx.has(type.permission as never) && !ctx.has("trade.manage")) return <p className="text-sm">You do not have permission to prepare this document.</p>;
  const lists = await loadFormLists();
  return (
    <>
      <TradeHeader title={`New ${type.name}`} subtitle={type.description ?? undefined} />
      <Flash ok={sp.ok} error={sp.error} />
      <DocForm type={type} parent={sp.parent && isUuid(sp.parent) ? sp.parent : undefined} {...lists} />
    </>
  );
}
