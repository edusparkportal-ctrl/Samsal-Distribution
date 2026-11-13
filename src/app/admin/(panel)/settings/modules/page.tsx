import { Flash } from "@/components/admin/Flash";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setModuleEnabled } from "./actions";

export const metadata = { title: "Modules" };

export default async function ModulesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  await requirePermission("settings.manage");
  const sb = await createSupabaseServerClient();
  const { data: modules } = await sb.from("modules").select("key, name, description, is_core, enabled").order("sort_order");
  return (
    <>
      <PageHeader title="Modules" description="Switch business modules on when the business is ready for them. A switched-off module disappears from the menu and its data cannot be read or changed, even by people whose role would otherwise allow it." />
      <Flash ok={sp.ok} error={sp.error} />
      <Panel>
        <ul className="divide-y divide-grey-200">
          {(modules ?? []).map((m: { key: string; name: string; description: string | null; is_core: boolean; enabled: boolean }) => (
            <li key={m.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-navy">{m.name} {m.is_core && <Badge tone="grey">Core</Badge>} <Badge tone={m.enabled ? "green" : "amber"}>{m.enabled ? "On" : "Off"}</Badge></p>
                <p className="text-sm text-grey-500">{m.description}</p>
              </div>
              {!m.is_core && (
                <form action={setModuleEnabled}>
                  <input type="hidden" name="key" value={m.key} />
                  <input type="hidden" name="enabled" value={m.enabled ? "false" : "true"} />
                  <button className={m.enabled ? "btn-outline px-4 py-2 text-sm" : "btn-primary px-4 py-2 text-sm"}>{m.enabled ? "Switch off" : "Switch on"}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
