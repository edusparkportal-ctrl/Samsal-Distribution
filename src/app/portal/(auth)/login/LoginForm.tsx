"use client";

import { useActionState } from "react";
import Link from "next/link";
import { portalSignIn, type PortalAuthState } from "../actions";
import { FormError } from "@/components/portal/AuthShell";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<PortalAuthState, FormData>(portalSignIn, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="field-label">Email address</label>
        <input id="email" name="email" type="email" autoComplete="username" inputMode="email" required className="field-input" />
      </div>
      <div>
        <label htmlFor="password" className="field-label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field-input" />
      </div>
      {state.error && <FormError>{state.error}</FormError>}
      <button type="submit" disabled={pending} className="btn-primary w-full justify-center">{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-sm"><Link href="/portal/forgot-password" className="font-medium text-teal-dark underline underline-offset-2">Forgot your password?</Link></p>
    </form>
  );
}
