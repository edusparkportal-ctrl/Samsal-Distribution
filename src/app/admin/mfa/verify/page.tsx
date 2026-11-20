import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-redirect";
import { MfaShell } from "../MfaShell";
import VerifyForm from "./VerifyForm";

export const metadata: Metadata = { title: "Verify your identity", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string; fresh?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const s = await getSession();
  if (s.status === "anonymous" || s.status === "unconfigured") redirect("/admin/login");
  if (s.status === "mfa_enroll") redirect(`/admin/mfa/setup?next=${encodeURIComponent(next)}`);
  if (s.status === "security_setup" || s.status === "pending") redirect("/admin/login");
  if (s.status === "ok") {
    // Already verified. A step-up (?fresh=1) still needs a new code unless one was entered in the last 15 minutes.
    if (!sp.fresh || s.ctx.mfa.recent) redirect(next);
    if (!s.ctx.mfa.enrolled) redirect(`/admin/mfa/setup?next=${encodeURIComponent(next)}`);
  }
  return (
    <MfaShell title="Two-step verification" intro={sp.fresh ? "This action needs a fresh code from your authenticator app." : "Enter the code from your authenticator app to finish signing in."}>
      <VerifyForm next={next} />
    </MfaShell>
  );
}
