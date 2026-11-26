import { notFound } from "next/navigation";
import { Flash } from "@/components/admin/Flash";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/forms";
import type { TradeDoc, TradeLine } from "@/lib/trade";
import { TradeHeader } from "../../../TradeHeader";
import { DocForm } from "../../../DocForm";
import { loadFormLists, loadTypes } from "../../../data";

export const metadata = { title: "Edit trade document" };
export const dynamic = "force-dynamic";

export default async function EditDoc({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  await requirePermission("trade.view", "trade");
  if (!isUuid(id)) notFound();
  const sb = await createSupabaseServerClient();
  const { data: doc } = await sb.from("trade_docs").select("*").eq("id", id).maybeSingle();
  if (!doc) notFound();
  if (!["draft", "rejected"].includes(doc.status)) return <p className="text-sm">Only a draft can be edited.</p>;
  const [{ data: lines }, types, lists] = await Promise.all([sb.from("trade_doc_lines").select("*").eq("doc_id", id).order("line_no"), loadTypes(), loadFormLists()]);
  const type = types.find((t) => t.key === doc.doc_type);
  if (!type) notFound();
  return (
    <>
      <TradeHeader title={`Edit ${type.name} ${doc.number}`} />
      <Flash ok={sp.ok} error={sp.error} />
      <DocForm type={type} doc={doc as TradeDoc} lines={(lines ?? []) as TradeLine[]} {...lists} />
    </>
  );
}
