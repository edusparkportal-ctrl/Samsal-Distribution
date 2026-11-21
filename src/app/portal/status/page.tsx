import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/portal/AuthShell";
import { getPortalSession } from "@/lib/portal/session";
import { portalSignOut } from "../(auth)/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account status" };

const COPY: Record<string, { title: string; body: string }> = {
  pending: { title: "Your application is being reviewed", body: "Thank you for applying. Our team checks each wholesale application and will email you once your account is approved. You can close this page." },
  rejected: { title: "We could not approve this application", body: "Please contact our sales team if you believe this is a mistake or would like to apply again." },
  suspended: { title: "Your account is on hold", body: "Online ordering is paused for this account. Please contact our sales team." },
  unavailable: { title: "The customer portal is not open right now", body: "Please check back soon, or contact our sales team to place an order." },
  no_application: { title: "No customer account found", body: "This sign-in is not linked to a customer account. If you are a customer, apply for a wholesale account." },
};

export default async function Page() {
  const s = await getPortalSession();
  if (s.status === "ok") redirect("/portal");
  if (s.status === "anonymous" || s.status === "unconfigured") redirect("/portal/login");
  const c = COPY[s.status] ?? COPY.unavailable;
  return (
    <AuthShell title={c.title} subtitle={"company" in s ? s.company : undefined}>
      <p className="text-sm leading-relaxed text-charcoal">{c.body}</p>
      <p className="mt-4 text-sm text-charcoal">Signed in as <span className="font-semibold">{s.email}</span>.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <form action={portalSignOut}><button className="btn-outline">Sign out</button></form>
        <Link href="/contact" className="btn-primary">Contact sales</Link>
        {s.status === "no_application" && <Link href="/portal/register" className="btn-outline">Apply for an account</Link>}
      </div>
    </AuthShell>
  );
}
