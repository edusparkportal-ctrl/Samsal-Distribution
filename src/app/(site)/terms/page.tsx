import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/LegalPage";
import { site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "Terms for using the SAMSAL Supply & Distribution Limited website, requesting quotations and placing orders.",
  path: "/terms",
  noindex: !site.legal.reviewed,
});

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      crumb="Terms of Service"
      title="Terms of Service"
      intro="The terms that apply when you use this website and request quotations from SAMSAL."
    >
      <LegalSection id="about" title="1. About these terms">
        <p>
          These terms apply to your use of this website, operated by {site.legalName} (&ldquo;SAMSAL&rdquo;). By using
          the website you agree to them. If you do not agree, please do not use the site. Separate written terms may
          apply to individual orders, and if they conflict with these terms, the order terms prevail.
        </p>
      </LegalSection>

      <LegalSection id="use" title="2. Use of the website">
        <LegalList
          items={[
            "Use the website only for lawful business purposes.",
            "Do not attempt to disrupt, probe or gain unauthorised access to the site or its systems.",
            "Do not submit false, misleading or abusive information, or use automated tools to submit forms.",
            "Information you submit must be accurate, and you must have the right to share it.",
          ]}
        />
      </LegalSection>

      <LegalSection id="info" title="3. Product information">
        <p>
          Product names, categories and descriptions on this website are general and for information only. They are not
          a guarantee that a particular product, brand, specification, pack size or quantity is available. We do not
          publish fixed prices because wholesale prices and availability change; the website shows no stock levels.
          Images are illustrative and may not show the exact product supplied.
        </p>
      </LegalSection>

      <LegalSection id="quotes" title="4. Quotations and orders">
        <LegalList
          items={[
            "Submitting the Request a Quote form is a request for information. It is not an order and does not oblige either party.",
            "A quotation is our offer on the terms stated in it, including any validity period. [Standard validity period to be confirmed.]",
            "An order is binding only when we confirm it in writing after you accept a quotation.",
            "Prices, availability, delivery times and delivery areas are confirmed in the quotation or order confirmation and may change before then.",
            "Payment terms, delivery, inspection, returns and risk are set out in the order confirmation or separate trading terms. [To be completed by SAMSAL with legal advice.]",
          ]}
        />
      </LegalSection>

      <LegalSection id="files" title="5. Files you send us">
        <p>
          You are responsible for what you attach. Do not send unlawful, infringing or malicious files, or files
          containing sensitive personal data. See our <Link href="/privacy" className="font-semibold text-teal-dark underline">Privacy Policy</Link> for how
          information is handled.
        </p>
      </LegalSection>

      <LegalSection id="ip" title="6. Intellectual property">
        <p>
          The website, its design, text, logo and illustrations belong to SAMSAL or its licensors. You may view and
          print pages for your own business use, but may not copy, republish or reuse them commercially without our
          written permission.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="7. Liability">
        <p>
          We take care to keep the website accurate and available, but it is provided &ldquo;as is&rdquo;, and we do
          not guarantee it will be uninterrupted or error-free. To the extent permitted by law, SAMSAL is not liable
          for loss arising from your use of the website or reliance on its general information. Nothing in these
          terms limits liability that cannot lawfully be limited. [Adviser to settle the wording of this section.]
        </p>
      </LegalSection>

      <LegalSection id="links" title="8. Third-party services and links">
        <p>
          Links to other websites, and tools such as WhatsApp, are provided for convenience. We do not control them
          and are not responsible for their content or practices.
        </p>
      </LegalSection>

      <LegalSection id="law" title="9. Governing law and changes">
        <p>
          These terms are governed by the laws of Kenya, and the courts of Kenya have jurisdiction, subject to any
          different terms agreed in writing for a specific order. [Adviser to confirm.] We may update these terms from
          time to time; the version published on this page applies from the date it is posted.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
