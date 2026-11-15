import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { quoteHref } from "@/config/navigation";
import { WhatsAppButton } from "@/components/WhatsAppButton";

/** Closing quotation call to action, reused across pages. */
export function CtaBanner({
  title = "Ready to get a quotation?",
  text = "Send us your requirements. Tell us what you need, how much and by when, and we will come back with a clear quotation.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <section className="on-dark bg-navy text-white">
      <div className="container-x grid items-center gap-8 py-14 sm:py-16 lg:grid-cols-[1fr_auto]">
        <div className="max-w-2xl">
          <p className="eyebrow">Request a quotation</p>
          <h2 className="text-3xl text-white sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg text-white/90">{text}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
          <Link href={quoteHref} className="btn-accent px-7 py-3.5 text-base">
            Request a Quote <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <WhatsAppButton className="btn-outline-light px-7 py-3.5 text-base" />
        </div>
      </div>
    </section>
  );
}
