"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthState } from "../login/actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl sm:p-8">
        <h1 className="text-xl font-bold text-navy">Reset your password</h1>
        <p className="mt-1 text-sm text-grey-500">Enter your staff email and we will send you a reset link.</p>
        <form action={action} className="mt-6 space-y-5" noValidate>
          <div>
            <label htmlFor="email" className="field-label">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="field-input" />
          </div>
          {state.error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
          {state.message && <p role="status" className="rounded-md border border-teal/40 bg-teal-tint px-3 py-2 text-sm text-navy">{state.message}</p>}
          <button type="submit" disabled={pending} className="btn-primary w-full justify-center disabled:opacity-60">{pending ? "Sending…" : "Send reset link"}</button>
          <p className="text-center text-sm"><Link href="/admin/login" className="font-medium text-teal-dark underline underline-offset-2">Back to sign-in</Link></p>
        </form>
      </div>
    </main>
  );
}
