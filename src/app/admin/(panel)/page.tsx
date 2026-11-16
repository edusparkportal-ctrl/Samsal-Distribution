import Link from "next/link";
import { PageHeader, Panel, StatCard, Notice } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildNav } from "@/lib/modules";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const ctx = await requireStaff();
  const sb = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const head = { count: "exact" as const, head: true };

  const stats: { label: string; value: number; href: string; hint?: string }[] = [];
  const todo: Promise<void>[] = [];
  const add = (cond: boolean, label: string, href: string, q: () => PromiseLike<{ count: number | null }>, hint?: string) => {
    if (cond) todo.push(count(q()).then((value) => void stats.push({ label, value, href, hint })));
  };

  const crm = ctx.has("enquiries.view") && ctx.moduleEnabled("crm");
  add(crm, "New enquiries", "/admin/crm/enquiries?status=new", () => sb.from("enquiries").select("id", head).eq("status", "new").is("deleted_at", null));
  add(crm, "Follow-ups due", "/admin/crm/enquiries?followup=due", () => sb.from("enquiries").select("id", head).lte("follow_up_date", today).not("status", "in", "(accepted,declined,completed)").is("deleted_at", null), "On or before today");
  add(ctx.has("quotations.view") && ctx.moduleEnabled("quotations"), "Draft quotations", "/admin/quotations?status=draft", () => sb.from("quotations").select("id", head).eq("status", "draft"));
  add(ctx.has("products.manage"), "Published products", "/admin/website/products", () => sb.from("products").select("id", head).eq("status", "published").is("deleted_at", null));
  add(ctx.has("products.manage"), "Draft products", "/admin/website/products?status=draft", () => sb.from("products").select("id", head).eq("status", "draft").is("deleted_at", null));
  add(ctx.has("suppliers.view") && ctx.moduleEnabled("suppliers"), "Active suppliers", "/admin/suppliers", () => sb.from("suppliers").select("id", head).eq("is_active", true).is("deleted_at", null));
  add(ctx.has("purchasing.approve") && ctx.moduleEnabled("procurement"), "POs awaiting approval", "/admin/procurement/purchase-orders?status=pending_approval", () => sb.from("purchase_orders").select("id", head).eq("status", "pending_approval"));
  add(ctx.has("tenders.view") && ctx.moduleEnabled("tenders"), "Open tenders", "/admin/tenders", () => sb.from("tenders").select("id", head).in("bid_status", ["monitoring", "preparing", "ready"]).is("deleted_at", null));
  add(ctx.has("hr.view") && ctx.moduleEnabled("hr"), "Open staffing requests", "/admin/hr/requisitions?status=open", () => sb.from("hr_requisitions").select("id", head).in("status", ["open", "sourcing", "shortlisted"]).is("deleted_at", null));

  // Setup checklist: things the site still needs from the business (nothing is invented for them).
  type Check = { label: string; done: boolean; href: string };
  const checks: Check[] = [];
  if (ctx.has("content.manage")) {
    const [{ data: company }, contacts, social, staff] = await Promise.all([
      sb.from("company_settings").select("address_line, business_hours, mission, vision, registration_details").eq("id", 1).maybeSingle(),
      count(sb.from("contact_channels").select("id", head).eq("is_active", true)),
      count(sb.from("social_links").select("id", head).eq("enabled", true)),
      count(sb.from("staff_members").select("id", head).eq("is_active", true).is("deleted_at", null)),
    ]);
    checks.push(
      { label: "Add a public telephone number and email", done: contacts > 0, href: "/admin/website/contacts" },
      { label: "Add the business address and hours", done: Boolean(company?.address_line && company?.business_hours), href: "/admin/website/company" },
      { label: "Write the mission and vision", done: Boolean(company?.mission && company?.vision), href: "/admin/website/company" },
      { label: "Add management profiles (only with approval)", done: staff > 0, href: "/admin/website/staff" },
      { label: "Add social media accounts that really exist", done: social > 0, href: "/admin/website/social" },
      { label: "Enter registration details to show on quotations", done: Boolean(company?.registration_details), href: "/admin/website/company" },
    );
  }
  await Promise.all(todo);
  stats.sort((a, b) => a.label.localeCompare(b.label));
  const nav = buildNav({ has: ctx.has, moduleEnabled: ctx.moduleEnabled });
  const open = checks.filter((c) => !c.done);

  return (
    <>
      <PageHeader title={`Welcome, ${ctx.fullName.split(" ")[0] || "there"}`} description={`Signed in as ${ctx.roleName}. You only see the areas your role allows.`} />
      {stats.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((s) => <StatCard key={s.label} {...s} />)}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {checks.length > 0 && (
          <Panel title="Website setup checklist">
            {open.length === 0 ? <Notice tone="success">Everything on the checklist is filled in.</Notice> : <p className="mb-3 text-sm text-grey-500">{open.length} item{open.length > 1 ? "s" : ""} still need your input. Nothing is shown on the public site until you add it.</p>}
            <ul className="space-y-2 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2">
                  <span aria-hidden="true" className={`mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold ${c.done ? "bg-teal text-white" : "border border-grey-300 text-transparent"}`}>✓</span>
                  {c.done ? <span className="text-grey-500 line-through">{c.label}</span> : <Link href={c.href} className="font-medium text-teal-dark underline underline-offset-2">{c.label}</Link>}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel title="Your areas">
          {nav.modules.length === 0 ? <p className="text-sm text-grey-500">Your role has no modules assigned yet.</p> : (
            <ul className="space-y-2 text-sm">
              {nav.modules.map((m) => (
                <li key={m.key}><Link href={m.items[0].href} className="font-medium text-teal-dark underline underline-offset-2">{m.label}</Link><span className="text-grey-500"> · {m.items.map((i) => i.label).join(", ")}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
