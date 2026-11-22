import Link from "next/link";
import { requireCustomer } from "@/lib/portal/session";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "More" };
const LINKS: [string, string, string][] = [
  ["/portal/quotes", "Quotations", "Request a price, answer quotations we sent"],
  ["/portal/bulk", "Bulk order", "Upload a list of products and quantities"],
  ["/portal/support", "Support", "Ask us about an order, delivery or invoice"],
  ["/portal/payments", "Payment history", "Every payment we have received"],
  ["/portal/account", "My account", "Your details and sign-out"],
];

export default async function Page() {
  await requireCustomer();
  return (
    <>
      <PageHeader title="More" />
      <ul className="space-y-3">
        {LINKS.map(([href, title, hint]) => (
          <li key={href}><Link href={href} className="card block p-4 transition-shadow hover:shadow-md"><p className="font-bold text-navy">{title}</p><p className="text-sm text-grey-500">{hint}</p></Link></li>
        ))}
      </ul>
    </>
  );
}
