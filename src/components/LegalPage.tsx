import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHero } from "@/components/ui";
import { placeholders, site } from "@/config/site";

export function LegalPage({
  eyebrow,
  title,
  crumb,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  crumb: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} crumb={crumb} intro={intro} />
      <section className="section">
        <div className="container-x max-w-3xl">
          {!site.legal.reviewed && (
            <div role="note" className="mb-10 flex gap-3 border-l-4 border-amber bg-amber/10 p-5 text-sm text-navy">
              <AlertTriangle aria-hidden="true" size={22} className="mt-0.5 shrink-0 text-amber-dark" />
              <div>
                <p className="font-bold">Draft for legal review. Not yet approved for publication.</p>
                <p className="mt-1.5 leading-relaxed">
                  This document is a working draft prepared to support the website. It has not been reviewed by a
                  qualified Kenyan advocate or data protection adviser and must be reviewed, completed and approved
                  before it is relied on. It does not certify compliance with any law. Items in [square brackets] are
                  to be completed by SAMSAL. Draft dated {site.legal.draftDate}.
                </p>
              </div>
            </div>
          )}
          <div className="legal-prose space-y-10">{children}</div>
          <p className="mt-12 border-t border-grey-200 pt-6 text-sm text-grey-500">
            Contact: {site.contact.email ?? placeholders.email} &middot; {site.contact.phone ?? placeholders.phone}
          </p>
        </div>
      </section>
    </>
  );
}

export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <h2 id={`${id}-h`} className="text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-base leading-relaxed">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6 marker:text-teal">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
