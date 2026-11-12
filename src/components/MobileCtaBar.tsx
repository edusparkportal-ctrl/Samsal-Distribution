"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, MessageCircle } from "lucide-react";
import { quoteHref } from "@/config/navigation";
import { whatsappLink } from "@/config/site";

/**
 * Persistent action bar on phones: the primary conversion (Request a Quote) is always one tap away.
 * Hidden on desktop and on the quote page itself. WhatsApp appears only once a number is configured.
 */
export function MobileCtaBar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  // Appears after the visitor has scrolled past the first screen, so it never duplicates the hero buttons.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname.startsWith("/quote") || !scrolled) return null;
  const wa = whatsappLink();

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-grey-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(20,45,78,0.08)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-md gap-3">
        <Link href={quoteHref} className="btn-accent flex-1 py-3">
          <FileText aria-hidden="true" size={18} /> Request a Quote
        </Link>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="btn-whatsapp px-4 py-3">
            <MessageCircle aria-hidden="true" size={20} />
          </a>
        )}
      </div>
    </div>
  );
}
