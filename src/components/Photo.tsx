import Image from "next/image";
import type { ReactNode } from "react";
import type { PhotoSlot } from "@/config/images";

/**
 * Renders a photograph if one is configured in src/config/images.ts (or passed
 * directly); otherwise renders a restrained branded panel. This keeps layouts
 * intact and avoids fake or irrelevant stock imagery.
 */
export function Photo({
  slot,
  fallback,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  priority = false,
  className = "",
  tone = "light",
}: {
  slot: PhotoSlot | undefined;
  fallback?: ReactNode;
  sizes?: string;
  priority?: boolean;
  className?: string;
  tone?: "light" | "dark";
}) {
  if (slot) {
    return (
      <div className={`relative overflow-hidden bg-grey ${className}`}>
        <Image src={slot.src} alt={slot.alt} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`relative flex items-center justify-center overflow-hidden ${
        tone === "dark" ? "bg-navy-800 text-teal-light bg-grid" : "bg-teal-tint text-teal-dark bg-grid-light"
      } ${className}`}
    >
      {fallback}
    </div>
  );
}
