import { ArrowRight, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description: "Privacy policy for SAMSAL Supply & Distribution Limited. This legal content should be reviewed by a qualified Kenyan adviser before publication.",
  path: "/privacy-policy",
});

export default function PrivacyPolicyPage() {
  return (
    <main className="section">
      <div className="container-x max-w-4xl">
        <p className="eyebrow">Legal</p>
        <h1 className="text-4xl text-navy sm:text-5xl">Privacy Policy</h1>
        <div className="mt-6 rounded-2xl border border-amber/40 bg-amber/5 p-4 text-sm text-slate-700">
          <strong className="text-navy">Review notice:</strong> This content is a draft and should be reviewed by a qualified Kenyan legal adviser before publication.
          It is not a certification of legal compliance.
        </div>

        <div className="mt-8 space-y-8 text-base leading-8 text-slate-700">
          <p><strong>SAMSAL Supply & Distribution Limited</strong> (“we”, “our”, “us”) may collect personal information through website forms, email enquiries, and direct communications. This notice explains what we collect, why we collect it, how we handle it, and the rights of individuals whose information is processed.</p>

          <h2 className="text-2xl font-bold text-navy">1. Information we collect</h2>
          <p>We may collect contact details including names, business or organisation names, email addresses, telephone numbers, delivery locations, and product or specification details submitted through the quotation or enquiry forms. We may also collect file attachments where a customer sends supporting documents such as a list of products, BOQ, or specifications.</p>

          <h2 className="text-2xl font-bold text-navy">2. Purpose of processing</h2>
          <p>We process personal information to respond to enquiries, prepare quotations, assess requirements, coordinate supply and delivery, communicate with customers, and maintain reasonable records of business communications. Where appropriate, we may use the information to comply with legitimate business operations and customer service obligations.</p>

          <h2 className="text-2xl font-bold text-navy">3. Data handling and storage</h2>
          <p>We keep personal information only for as long as required for the purpose for which it was collected, or as required by law. We do not intentionally store customer data in a database for marketing purposes. Form data and attachments are handled securely and transmitted only as needed for processing the enquiry or quotation. Files are not kept longer than necessary for the business purpose and should be deleted when no longer required.</p>

          <h2 className="text-2xl font-bold text-navy">4. Third parties and email delivery</h2>
          <p>Quotation and enquiry requests may be sent to an email address configured by the business for processing. We may use trusted email service providers to deliver messages and attachments. These providers are used only to facilitate communication and are not to be used as a basis for marketing or profiling.</p>

          <h2 className="text-2xl font-bold text-navy">5. Customer rights</h2>
          <p>Individuals may request access to their personal data, correction of inaccurate information, withdrawal of consent where consent is the basis of processing, and deletion of information where lawful. Requests should be made by contacting the business using the contact details on the site. We will respond within a reasonable period and in accordance with applicable law.</p>

          <h2 className="text-2xl font-bold text-navy">6. Security</h2>
          <p>We use reasonable organisational and technical safeguards to protect personal information from unauthorised access, misuse, or loss. However, no system can be guaranteed fully secure and users should not send sensitive personal or financial information unless strictly necessary.</p>

          <h2 className="text-2xl font-bold text-navy">7. Contact and review</h2>
          <p>Questions regarding this policy should be directed to the business using the contact information displayed on the website. This policy should be reviewed and adapted by a qualified Kenyan adviser before publication or use in a formal compliance context.</p>
        </div>

        <div className="mt-10 flex justify-start">
          <Link href="/terms" className="btn-outline inline-flex items-center gap-2">Read Terms of Service <ArrowRight aria-hidden="true" size={18} /></Link>
        </div>
      </div>
    </main>
  );
}
