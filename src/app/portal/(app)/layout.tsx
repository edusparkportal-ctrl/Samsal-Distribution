import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { requireCustomer } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: ReactNode }) {
  const ctx = await requireCustomer();
  return <PortalShell ctx={ctx}>{children}</PortalShell>;
}
