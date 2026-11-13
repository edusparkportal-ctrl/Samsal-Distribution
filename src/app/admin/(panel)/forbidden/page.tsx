import Link from "next/link";
import { PageHeader, Panel } from "@/components/admin/ui";

export const metadata = { title: "Access denied" };

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <>
      <PageHeader title="Access denied" />
      <Panel>
        <p className="text-charcoal">
          {reason === "module"
            ? "This module is switched off. A Super Administrator can turn it on under Settings → Modules."
            : "Your role does not include permission to view that page. If you need access, ask a Super Administrator."}
        </p>
        <Link href="/admin" className="btn-primary mt-5 inline-flex">Back to the dashboard</Link>
      </Panel>
    </>
  );
}
