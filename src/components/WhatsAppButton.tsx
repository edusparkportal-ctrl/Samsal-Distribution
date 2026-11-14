import { MessageCircle } from "lucide-react";
import { getSiteContent } from "@/lib/content/load";
import { whatsappHref } from "@/lib/content/helpers";

/**
 * WhatsApp enquiry shortcut. It supplements - never replaces - the quotation form.
 * Renders nothing until a WhatsApp number is added in the admin panel (or NEXT_PUBLIC_WHATSAPP_NUMBER), so visitors
 * are never sent to a wrong or placeholder number.
 */
export async function WhatsAppButton({
  message,
  label = "Chat on WhatsApp",
  className = "btn-whatsapp",
}: {
  message?: string;
  label?: string;
  className?: string;
}) {
  const { contact } = await getSiteContent();
  const href = whatsappHref(contact.whatsappNumber, message);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      <MessageCircle aria-hidden="true" size={18} />
      {label}
    </a>
  );
}
