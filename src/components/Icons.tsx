import {
  Boxes,
  Building2,
  ClipboardCheck,
  FileText,
  HandHelping,
  MapPinned,
  Package,
  Search,
  SprayCan,
  Truck,
  UtensilsCrossed,
  Wrench,
  type LucideProps,
} from "lucide-react";
import type { IconName } from "@/config/products";
import type { ServiceIcon } from "@/config/services";

const categoryIcons = {
  spray: SprayCan,
  hand: HandHelping,
  file: FileText,
  boxes: Boxes,
  package: Package,
  utensils: UtensilsCrossed,
  wrench: Wrench,
};

const serviceIcons = {
  search: Search,
  boxes: Boxes,
  building: Building2,
  truck: Truck,
  clipboard: ClipboardCheck,
  map: MapPinned,
};

export function CategoryIcon({ name, ...props }: { name: IconName } & LucideProps) {
  const Icon = categoryIcons[name] ?? Package;
  return <Icon aria-hidden="true" {...props} />;
}

export function ServiceIconView({ name, ...props }: { name: ServiceIcon } & LucideProps) {
  const Icon = serviceIcons[name] ?? Boxes;
  return <Icon aria-hidden="true" {...props} />;
}
