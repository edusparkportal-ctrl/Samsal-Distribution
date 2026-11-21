import { Notice } from "@/components/admin/ui";

export function PortalFlash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return <div className="mb-5">{error ? <Notice tone="error">{error}</Notice> : <Notice tone="success">{ok}</Notice>}</div>;
}
