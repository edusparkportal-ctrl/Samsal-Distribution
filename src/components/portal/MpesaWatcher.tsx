"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Polls our own status endpoint after an M-Pesa prompt is sent, then refreshes the page with the result. */
export default function MpesaWatcher({ id, invoiceId }: { id: string; invoiceId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("Waiting for you to enter your M-Pesa PIN on your phone…");
  useEffect(() => {
    let stop = false;
    let tries = 0;
    const tick = async () => {
      if (stop) return;
      tries++;
      try {
        const r = await fetch(`/portal/mpesa/${id}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { status: string };
          if (["succeeded", "failed", "cancelled", "expired", "needs_review"].includes(j.status)) { router.replace(`/portal/invoices/${invoiceId}?done=${j.status}`); router.refresh(); return; }
        }
      } catch { /* keep trying */ }
      if (tries >= 45) { setMsg("We have not heard back yet. If you paid, it will show here shortly; otherwise you can try again."); return; }
      setTimeout(tick, 4000);
    };
    const t = setTimeout(tick, 3000);
    return () => { stop = true; clearTimeout(t); };
  }, [id, invoiceId, router]);
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3 rounded border border-teal/30 bg-teal/5 p-4 text-sm text-charcoal">
      <span aria-hidden className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      <span>{msg}</span>
    </div>
  );
}
