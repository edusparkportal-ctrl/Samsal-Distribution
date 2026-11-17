import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireStaff } from "@/lib/auth/session";
import { buildNav } from "@/lib/modules";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | SAMSAL Admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const nav = buildNav({ has: ctx.has, moduleEnabled: ctx.moduleEnabled });
  const shellNav = {
    modules: nav.modules.map((m) => ({ key: m.key, label: m.label, icon: m.icon, items: m.items.map((i) => ({ label: i.label, href: i.href })) })),
    settings: nav.settings.map((i) => ({ label: i.label, href: i.href })),
  };
  // Unread count for the bell. RLS limits this to the signed-in person's own notifications; a failure just shows no badge.
  let unread = 0;
  try {
    const sb = await createSupabaseServerClient();
    const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
    unread = count ?? 0;
  } catch {
    unread = 0;
  }
  return (
    <AdminShell nav={shellNav} user={{ name: ctx.fullName, role: ctx.roleName }} unread={unread}>
      {children}
    </AdminShell>
  );
}
