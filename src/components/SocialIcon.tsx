import { Facebook, Globe, Instagram, Linkedin, Twitter, Youtube, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  linkedin: Linkedin, facebook: Facebook, instagram: Instagram, x: Twitter, twitter: Twitter, youtube: Youtube,
};

/** Icon for a social platform name; unknown platforms get a neutral globe. Names come from the admin panel. */
export function SocialIcon({ platform, size = 18 }: { platform: string; size?: number }) {
  const Icon = ICONS[platform.trim().toLowerCase()] ?? Globe;
  return <Icon aria-hidden="true" size={size} />;
}
