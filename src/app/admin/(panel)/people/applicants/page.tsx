import { ResourceView, type SP } from "@/components/admin/ResourceView";
import { Panel } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RESOURCES } from "@/lib/admin/resources";
import { hireApplicant } from "./actions";

const def = RESOURCES.job_applicants;
export const metadata = { title: def.label };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireStaff();
  const showHire = !sp.edit && sp.new !== "1" && (ctx.has("people.manage") || ctx.isSuper) && ctx.moduleEnabled("people");
  let ready: { id: string; full_name: string }[] = [];
  if (showHire) {
    const sb = await createSupabaseServerClient();
    const { data } = await sb.from("job_applicants").select("id, full_name").eq("consent_recorded", true).in("stage", ["offer"]).is("deleted_at", null);
    ready = (data ?? []) as typeof ready;
  }
  return (
    <>
      {ready.length > 0 && (
        <div className="mb-6">
          <Panel title="Ready to hire (offer stage, consent recorded)">
            <ul className="space-y-2">
              {ready.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium text-navy">{a.full_name}</span>
                  <form action={hireApplicant} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="date" name="hire_date" required aria-label="Start date" className="rounded border border-grey-300 px-2 py-1.5" />
                    <button className="btn-primary px-3 py-1.5 text-sm">Hire and create employee</button>
                  </form>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
      <ResourceView def={def} sp={sp} />
    </>
  );
}
