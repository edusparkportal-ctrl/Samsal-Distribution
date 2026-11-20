import { signOut } from "../login/actions";
import { Logo } from "@/components/Logo";

/** Same look as the sign-in page, for the pages a person sees before they have full access. */
export function MfaShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo onDark /></div>
        <div className="rounded-lg bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-xl font-bold text-navy">{title}</h1>
          <p className="mt-1 text-sm text-grey-500">{intro}</p>
          <div className="mt-6">{children}</div>
        </div>
        <form action={signOut} className="mt-6 text-center text-xs text-white/70">
          <button type="submit" className="underline underline-offset-2">Sign out</button>
        </form>
      </div>
    </main>
  );
}
