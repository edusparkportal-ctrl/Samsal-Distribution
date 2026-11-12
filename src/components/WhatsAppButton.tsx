import { MessageCircle } from "lucide-react";
import { whatsappLink } from "@/config/site";

/**
 * WhatsApp enquiry shortcut. It supplements - never replaces - the quotation form.
 * Renders nothing until NEXT_PUBLIC_WHATSAPP_NUMBER is configured, so visitors
 * are never sent to a wrong or placeholder number.
 */
export function WhatsAppButton({
  message,
  label = "Chat on WhatsApp",
  className = "btn-whatsapp",
}: {
  message?: string;
  label?: string;
  className?: string;
}) {
  const href = whatsappLink(message);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      <MessageCircle aria-hidden="true" size={18} />
      {label}
    </a>
  );
}
