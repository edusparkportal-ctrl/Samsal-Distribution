import { Notice } from "@/components/admin/ui";

/** Shows the ?ok= / ?error= message left by lib/admin/forms.flash(). */
export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mb-5">
      {error ? <Notice tone="error">{error}</Notice> : <Notice tone="success">{ok}</Notice>}
    </div>
  );
}
