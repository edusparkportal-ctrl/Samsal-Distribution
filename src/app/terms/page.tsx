import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms of Service",
  description: "Terms of service for SAMSAL Supply & Distribution Limited. This is draft legal content for review by a qualified Kenyan adviser before publication.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="section">
      <div className="container-x max-w-4xl">
        <p className="eyebrow">Legal</p>
        <h1 className="text-4xl text-navy sm:text-5xl">Terms of Service</h1>
        <div className="mt-6 rounded-2xl border border-amber/40 bg-amber/5 p-4 text-sm text-slate-700">
          <strong className="text-navy">Review notice:</strong> This content is a draft and should be reviewed by a qualified Kenyan legal adviser before publication.
          It is not a certification of legal compliance.
        </div>

        <div className="mt-8 space-y-8 text-base leading-8 text-slate-700">
          <p>These Terms of Service govern use of the SAMSAL Supply & Distribution Limited website and any related requests for quotations or enquiries made through this website.</p>

          <h2 className="text-2xl font-bold text-navy">1. Scope</h2>
          <p>The website provides information about products, supply services, distribution services, and quotation requests. It does not create a contractual relationship unless and until a formal quotation is accepted by the customer in writing.</p>

          <h2 className="text-2xl font-bold text-navy">2. Quotation requests</h2>
          <p>Any product or service request submitted through the quotation form is a request for pricing and availability information. Pricing and availability may vary depending on specification, quantity, delivery location, seasonality, and supplier conditions. We do not quote prices or confirm stock without review of the submitted requirement.</p>

          <h2 className="text-2xl font-bold text-navy">3. Accuracy of information</h2>
          <p>We aim to keep product, service, and contact information accurate and up to date. However, descriptions and references may change without notice. Customers should not rely on the website as a final binding offer or legal representation of stock, pricing, or delivery coverage. Final supply arrangements must be confirmed in writing.</p>

          <h2 className="text-2xl font-bold text-navy">4. User conduct</h2>
          <p>Users must provide truthful and relevant information when requesting a quotation or submitting an enquiry. Users must not submit unlawful, abusive, misleading, or malicious content. We reserve the right to decline or ignore enquiries that are inappropriate, incomplete, or harmful.</p>

          <h2 className="text-2xl font-bold text-navy">5. Intellectual property</h2>
          <p>All content, branding, text, layouts, and images on this website are owned by or licensed to SAMSAL Supply & Distribution Limited unless otherwise stated. Reproduction without prior written permission is prohibited.</p>

          <h2 className="text-2xl font-bold text-navy">6. Limitation of liability</h2>
          <p>To the extent permitted by law, SAMSAL Supply & Distribution Limited shall not be liable for indirect, incidental, special, or consequential damages arising from the use of this website or from reliance on information posted on the site. Any final supply or commercial arrangement must be governed by separate written terms and conditions agreed between the parties.</p>

          <h2 className="text-2xl font-bold text-navy">7. Changes</h2>
          <p>We may update these terms from time to time. Continued use of the website after changes are posted indicates acceptance of the revised terms. This website is not intended to replace legal advice, and any material legal or commercial matters should be reviewed by qualified advisers.</p>
        </div>

        <div className="mt-10 flex justify-start">
          <Link href="/privacy-policy" className="btn-outline inline-flex items-center gap-2"><ArrowLeft aria-hidden="true" size={18} />Back to Privacy Policy</Link>
        </div>
      </div>
    </main>
  );
}
