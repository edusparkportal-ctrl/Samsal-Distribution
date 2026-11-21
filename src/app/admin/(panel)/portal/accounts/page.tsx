import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewAccount } from "./actions";

export const metadata = { title: "Portal accounts" };

type Account = {
  user_id: string; customer_id: string | null; status: "pending" | "active" | "suspended" | "rejected";
  company_name: string; contact_name: string; phone: string | null; kra_pin: string | null; location: string | null; review_note: string | null; created_at: string;
};
const TONE = { pending: "amber", active: "green", suspended: "red", rejected: "grey" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePermission("portal.view", "portal");
  const canManage = ctx.has("portal.manage") || ctx.isSuper;
  const sb = await createSupabaseServerClient();
  const [{ data: accounts }, { data: customers }, { data: profiles }] = await Promise.all([
    sb.from("customer_accounts").select("user_id, customer_id, status, company_name, contact_name, phone, kra_pin, location, review_note, created_at").order("created_at", { ascending: false }).limit(300),
    sb.from("customers").select("id, company_name, contact_name, email").is("deleted_at", null).order("company_name").limit(1000),
    sb.from("profiles").select("id, email"),
  ]);
  const list = (accounts ?? []) as Account[];
  const email = new Map((profiles ?? []).map((p: { id: string; email: string | null }) => [p.id, p.email ?? ""]));
  const cust = (customers ?? []) as { id: string; company_name: string | null; contact_name: string; email: string }[];
  const custName = new Map(cust.map((c) => [c.id, c.company_name || c.contact_name]));
  const pending = list.filter((a) => a.status === "pending");
  const rest = list.filter((a) => a.status !== "pending");

  const Card = ({ a }: { a: Account }) => (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-navy">{a.company_name} <Badge tone={TONE[a.status]}>{a.status}</Badge></p>
          <p className="text-sm text-charcoal">{a.contact_name} · {email.get(a.user_id) || "no email"}{a.phone ? ` · ${a.phone}` : ""}</p>
          <p className="text-xs text-grey-500">{a.kra_pin ? `KRA PIN ${a.kra_pin} · ` : ""}{a.location ? `${a.location} · ` : ""}Applied {new Date(a.created_at).toLocaleDateString("en-KE")}{a.customer_id ? ` · Linked to ${custName.get(a.customer_id) ?? "a customer"}` : ""}</p>
          {a.review_note && <p className="mt-1 text-xs text-grey-500">Note: {a.review_note}</p>}
        </div>
      </div>
      {canManage && (
        <form action={reviewAccount} className="mt-3 flex flex-wrap items-end gap-2 border-t border-grey-200 pt-3">
          <input type="hidden" name="user_id" value={a.user_id} />
          {(a.status === "pending" || a.status === "rejected") && (
            <div className="min-w-[220px] flex-1">
              <label className="field-label" htmlFor={`c-${a.user_id}`}>Link to customer</label>
              <select id={`c-${a.user_id}`} name="customer_id" className="field-input" defaultValue="">
                <option value="">Create a new customer from this application</option>
                {cust.map((c) => <option key={c.id} value={c.id}>{(c.company_name || c.contact_name) + " · " + c.email}</option>)}
              </select>
            </div>
          )}
          <div className="min-w-[160px] flex-1"><label className="field-label" htmlFor={`n-${a.user_id}`}>Note</label><input id={`n-${a.user_id}`} name="note" maxLength={500} className="field-input" /></div>
          {(a.status === "pending" || a.status === "rejected") && <button name="decision" value="approve" className="btn-primary">Approve</button>}
          {a.status === "pending" && <button name="decision" value="reject" className="btn-outline">Reject</button>}
          {a.status === "active" && <button name="decision" value="suspend" className="btn-outline !border-red-300 !text-red-700">Suspend</button>}
          {a.status === "suspended" && <button name="decision" value="reactivate" className="btn-primary">Reactivate</button>}
        </form>
      )}
    </li>
  );

  return (
    <>
      <PageHeader title="Portal accounts" description="Customers who applied for online ordering. Check the details (and the KRA PIN if you hold it), link the login to the right customer record, then approve. Approving needs a fresh authenticator code." />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel title={`Waiting for review (${pending.length})`} className="mb-6">
        {pending.length === 0 ? <p className="text-sm text-grey-500">No applications are waiting.</p> : <ul className="space-y-3">{pending.map((a) => <Card key={a.user_id} a={a} />)}</ul>}
      </Panel>
      <Panel title="All other accounts">
        {rest.length === 0 ? <p className="text-sm text-grey-500">Nothing here yet.</p> : <ul className="space-y-3">{rest.map((a) => <Card key={a.user_id} a={a} />)}</ul>}
      </Panel>
    </>
  );
}
