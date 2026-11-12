import Image from "next/image";
import { site } from "@/config/site";

export function Logo({ variant = "full", onDark = false, className = "", priority = false }: { variant?: "full" | "mark"; onDark?: boolean; className?: string; priority?: boolean }) {
  const file = variant === "full" ? (onDark ? "/logo/samsal-logo-on-dark.svg" : "/logo/samsal-logo.svg") : onDark ? "/logo/samsal-mark-on-dark.svg" : "/logo/samsal-mark.svg";
  const [w, h] = variant === "full" ? [212, 54] : [48, 48];

  return (
    <Image
      src={file}
      alt={`${site.legalName} logo`}
      width={w}
      height={h}
      priority={priority}
      unoptimized
      className={`align-middle ${className}`}
    />
  );
}
