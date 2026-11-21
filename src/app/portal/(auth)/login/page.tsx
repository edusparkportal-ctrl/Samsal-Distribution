import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { AuthShell } from "@/components/portal/AuthShell";
import { getPortalSession } from "@/lib/portal/session";
import { safePortalNext } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = { title: "Customer sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const s = await getPortalSession();
  if (s.status !== "anonymous" && s.status !== "unconfigured") redirect(s.status === "ok" ? safePortalNext(sp.next) : "/portal/status");
  return (
    <AuthShell title="Customer sign-in" subtitle="SAMSAL wholesale customers. Order, track deliveries and manage your account.">
      {sp.error === "link" && <p role="status" className="mb-5 rounded-md border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-charcoal">That link is invalid or has expired. Request a new one, or register again.</p>}
      {s.status === "unconfigured" && <p role="status" className="mb-5 rounded-md border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-charcoal">The customer portal is not available yet.</p>}
      <LoginForm next={safePortalNext(sp.next)} />
      <p className="mt-6 border-t border-grey-200 pt-5 text-center text-sm text-charcoal">
        New to SAMSAL? <Link href="/portal/register" className="font-semibold text-teal-dark underline underline-offset-2">Apply for a wholesale account</Link>
      </p>
    </AuthShell>
  );
}
