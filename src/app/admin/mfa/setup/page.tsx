import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-redirect";
import { MfaShell } from "../MfaShell";
import SetupForm from "./SetupForm";

export const metadata: Metadata = { title: "Set up two-step verification", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const s = await getSession();
  if (s.status === "anonymous" || s.status === "unconfigured" || s.status === "pending" || s.status === "security_setup") redirect("/admin/login");
  if (s.status === "mfa_verify") redirect(`/admin/mfa/verify?next=${encodeURIComponent(next)}`);
  let required = s.status === "mfa_enroll";
  if (s.status === "ok") {
    required = s.ctx.mfa.required;
    // Adding another device later needs a current code first; setting up the first one needs nothing more.
    if (s.ctx.mfa.enrolled && !s.ctx.mfa.recent) redirect(`/admin/mfa/verify?next=${encodeURIComponent("/admin/mfa/setup")}&fresh=1`);
  }
  return (
    <MfaShell title="Set up two-step verification" intro={required ? "Your role requires two-step verification before you can use the admin area." : "Protect your account with a code from your phone."}>
      <SetupForm next={next} />
    </MfaShell>
  );
}
