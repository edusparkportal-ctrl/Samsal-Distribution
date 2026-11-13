import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { Logo } from "@/components/Logo";
import { getSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  pending: "Your account is signed in but has not been given access yet. Ask a Super Administrator to activate it and assign a role.",
  link: "That link is invalid or has expired. Request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string; error?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (session.status === "ok") redirect(safeNext(sp.next));
  const notice = NOTICES[sp.reason ?? sp.error ?? ""];

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo onDark /></div>
        <div className="rounded-lg bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-xl font-bold text-navy">Staff sign-in</h1>
          <p className="mt-1 text-sm text-grey-500">SAMSAL administration. Authorised staff only.</p>
          {session.status === "unconfigured" && (
            <p role="status" className="mt-5 rounded-md border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-charcoal">
              The admin area is not connected to a database yet. Set the Supabase environment variables (see docs/SUPABASE_SETUP.md).
            </p>
          )}
          {notice && <p role="status" className="mt-5 rounded-md border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-charcoal">{notice}</p>}
          <div className="mt-6"><LoginForm next={safeNext(sp.next)} /></div>
        </div>
        <p className="mt-6 text-center text-xs text-white/70"><Link href="/" className="underline underline-offset-2">Back to the website</Link></p>
      </div>
    </main>
  );
}
