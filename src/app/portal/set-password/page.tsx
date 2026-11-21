import { redirect } from "next/navigation";
import SetPasswordForm from "./SetPasswordForm";
import { AuthShell } from "@/components/portal/AuthShell";
import { getPortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a password" };

export default async function Page({ searchParams }: { searchParams: Promise<{ change?: string }> }) {
  const sp = await searchParams;
  const s = await getPortalSession();
  if (s.status === "anonymous" || s.status === "unconfigured") redirect("/portal/login?error=link");
  return (
    <AuthShell title="Choose a password" subtitle="Use at least 10 characters, with letters and numbers.">
      <SetPasswordForm change={sp.change === "1"} />
    </AuthShell>
  );
}
