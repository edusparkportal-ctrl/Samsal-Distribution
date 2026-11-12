import { LegalList, LegalPage, LegalSection } from "@/components/LegalPage";
import { placeholders, site } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "How SAMSAL Supply & Distribution Limited collects, uses, shares and retains personal information submitted through its website forms, and your rights.",
  path: "/privacy",
  noindex: !site.legal.reviewed,
});

export default function PrivacyPage() {
  const { legal, contact } = site;
  return (
    <LegalPage
      eyebrow="Legal"
      crumb="Privacy Policy"
      title="Privacy Policy"
      intro="What personal information we collect through this website, why we collect it, how we handle it and the choices you have."
    >
      <LegalSection id="who" title="1. Who we are">
        <p>
          This website is operated by {site.legalName} (&ldquo;SAMSAL&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a
          procurement, wholesale supply and distribution business serving {site.serviceLocation}. For personal
          information collected through this website, SAMSAL is the data controller.
        </p>
        <LegalList
          items={[
            <>Registered company number: {legal.registeredNumber ?? "[to be added]"}</>,
            <>Registered address: {legal.registeredAddress ?? "[to be added]"}</>,
            <>Data protection registration (if applicable): {legal.dataProtectionRegistration ?? "[to be confirmed]"}</>,
            <>Privacy contact: {contact.email ?? placeholders.email}</>,
          ]}
        />
      </LegalSection>

      <LegalSection id="collect" title="2. Information we collect">
        <p>We collect only what you choose to send us through the website forms:</p>
        <LegalList
          items={[
            <><strong>Request a Quote form:</strong> organisation name, contact person, email address, telephone number, product or service required, product category, specifications, quantity, delivery location, required delivery date, additional instructions, and an optional attachment such as a product list, bill of quantities or specification.</>,
            <><strong>Business enquiry form:</strong> name, organisation (optional), email address, telephone number and your message.</>,
            <><strong>Technical information:</strong> your IP address is used briefly for spam and abuse prevention (see section 6). Our hosting provider also keeps standard server logs.</>,
          ]}
        />
        <p>
          Please do not include sensitive personal information (such as health, financial account or identity
          document details) in forms or attachments. We do not need it to prepare a quotation.
        </p>
        <p>
          This website does not currently use advertising or analytics cookies. [Confirm and update this statement if
          analytics or other tracking tools are added.]
        </p>
      </LegalSection>

      <LegalSection id="use" title="3. How and why we use it">
        <LegalList
          items={[
            "To respond to your enquiry and prepare and send quotations.",
            "To arrange sourcing, order confirmation, supply and delivery if you proceed.",
            "To communicate with you about your request.",
            "To protect the website and our business from spam, fraud and misuse.",
            "To meet legal, accounting and regulatory obligations where they apply.",
          ]}
        />
        <p>
          We rely on your request and consent (you choose to submit the form), our legitimate business interests in
          responding to enquiries and protecting the site, and legal obligations. [Adviser to confirm the lawful bases
          to be stated.] We do not sell personal information and we do not use it for unrelated marketing without your
          consent.
        </p>
      </LegalSection>

      <LegalSection id="handling" title="4. How your information is handled and shared">
        <p>
          Form submissions are sent to SAMSAL by email. The website does not keep a database of submissions or store
          uploaded attachments on its own servers. We share information only with service providers that help us
          operate the website and deliver your enquiry:
        </p>
        <LegalList
          items={[
            "Vercel, which hosts the website and processes requests.",
            "Resend, which delivers form submissions (including attachments) to our business inbox.",
            "Upstash, if enabled, which stores IP-based rate-limit counters for a short time.",
            "Cloudflare Turnstile, if enabled, which checks that a submission comes from a person.",
            "Our email and office tools, where submissions are received and stored.",
          ]}
        />
        <p>
          These providers may process data outside Kenya. [Adviser to confirm cross-border transfer requirements and
          safeguards, and to complete any required data processing terms.] We may also disclose information where
          required by law or to protect our rights.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="5. How long we keep it">
        <p>
          Enquiry emails and attachments are kept in our business email for as long as needed to handle your request
          and any resulting order, and then for [retention period to be confirmed, e.g. a fixed number of months for
          unsuccessful enquiries and the statutory period for completed orders and records]. When no longer needed,
          they are deleted or anonymised.
        </p>
      </LegalSection>

      <LegalSection id="security" title="6. Security and spam protection">
        <p>
          We use reasonable technical measures, including encrypted connections (HTTPS), server-side validation of
          form input and file type checks, and keeping credentials on the server. To limit abuse, the form uses a
          hidden trap field, a timing check and per-IP rate limiting. No method of transmission or storage is
          completely secure, and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="7. Your rights">
        <p>
          Under Kenyan data protection law you may have rights in relation to your personal data, which can include
          the right to be informed, to access it, to object to its processing, to have inaccurate data corrected, to
          have data deleted, and to receive a copy. [Adviser to confirm the exact rights and any limits that apply.]
        </p>
        <p>
          To exercise a right, contact us at {contact.email ?? placeholders.email}. We may need to verify your
          identity first. If you are unhappy with how we handle your information, you may also complain to the Office
          of the Data Protection Commissioner in Kenya.
        </p>
      </LegalSection>

      <LegalSection id="children" title="8. Children">
        <p>This website is intended for businesses and institutions and is not directed at children.</p>
      </LegalSection>

      <LegalSection id="changes" title="9. Changes to this policy">
        <p>
          We may update this policy from time to time. The current version is the one published on this page. [Add
          the effective date once approved.]
        </p>
      </LegalSection>
    </LegalPage>
  );
}
