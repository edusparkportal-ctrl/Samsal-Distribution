import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false, follow: false }, title: { default: "Customer portal", template: "%s | SAMSAL portal" } };

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
