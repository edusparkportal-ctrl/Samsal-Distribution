import Link from "next/link";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader, Panel } from "@/components/admin/ui";
import { portalSignOut } from "../../(auth)/actions";

export const metadata = { title: "Account" };

export default async function Page() {
  const ctx = await requireCustomer();
  return (
    <>
      <PageHeader title="Your account" />
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Details">
          <dl className="space-y-3 text-sm">
            <div><dt className="font-semibold text-navy">Company</dt><dd className="text-charcoal">{ctx.company}</dd></div>
            <div><dt className="font-semibold text-navy">Signed in as</dt><dd className="text-charcoal">{ctx.contactName}, {ctx.email}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-grey-500">To change your company details or add colleagues, contact your SAMSAL account manager.</p>
        </Panel>
        <Panel title="Security">
          <p className="mb-4 text-sm text-charcoal">Use a long password you do not use anywhere else. Sign out on shared computers.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/portal/set-password?change=1" className="btn-outline">Change password</Link>
            <form action={portalSignOut}><button className="btn-primary">Sign out</button></form>
          </div>
        </Panel>
      </div>
    </>
  );
}
