/**
 * CENTRAL PRODUCT CATALOGUE
 * -------------------------
 * Update products here; every page and card reads from this file.
 *
 * Rules followed (per brief):
 *  - No brands, manufacturers, certifications, stock levels or prices are stated.
 *  - `specs` lists the attributes a customer should specify. Values stay generic
 *    ("Specified per order") until real, confirmed specifications are available.
 *  - `packaging` is null until pack sizes are confirmed; the UI then says
 *    "Pack sizes confirmed on quotation".
 *  - Add `image: { src, alt }` to a product when a real photo exists.
 *
 * To add a new category (e.g. packaging, food & hospitality, hardware), append an
 * object to `categories` and its products to `products`. Pages update automatically.
 */

export type IconName = "spray" | "hand" | "file" | "boxes" | "package" | "utensils" | "wrench";

export type Category = {
  slug: string;
  name: string;
  summary: string;
  icon: IconName;
  seoDescription: string;
};

export type Product = {
  slug: string;
  name: string;
  category: string; // category slug
  description: string;
  specs: { label: string; value: string }[];
  packaging: string | null;
  image?: { src: string; alt: string };
};

export const categories: Category[] = [
  {
    slug: "cleaning-supplies",
    name: "Cleaning Supplies",
    summary: "Detergents, disinfectants and floor and surface care for facilities of every size.",
    icon: "spray",
    seoDescription:
      "Cleaning supplies for businesses and institutions in Kenya: detergents, disinfectants, bleach, dishwashing liquids, floor cleaners and industrial cleaning products.",
  },
  {
    slug: "hygiene-supplies",
    name: "Hygiene Supplies",
    summary: "Washroom and personal hygiene consumables, dispensers and protective items.",
    icon: "hand",
    seoDescription:
      "Hygiene supplies for offices, schools and hospitality in Nairobi: handwash, sanitiser, tissue products, bin liners, gloves and dispensers.",
  },
  {
    slug: "stationery-office-supplies",
    name: "Stationery and Office Supplies",
    summary: "Paper, writing materials, filing and everyday office consumables.",
    icon: "file",
    seoDescription:
      "Office stationery suppliers in Nairobi: printing paper, exercise books, notebooks, pens, pencils, files, folders and general office consumables.",
  },
  {
    slug: "general-institutional-supplies",
    name: "General Institutional Supplies",
    summary: "Operational consumables and other items sourced against your requirements.",
    icon: "boxes",
    seoDescription:
      "General institutional supplies in Kenya: general-purpose consumables, selected operational supplies and products sourced to customer requirements.",
  },
];

/** Future categories (not yet shown on the site). Move into `categories` when ready. */
export const plannedCategories = [
  "Packaging materials",
  "Food and hospitality supplies",
  "Hardware and maintenance supplies",
];

const STD = "Specified per order";

export const products: Product[] = [
  // ---------------- Cleaning supplies ----------------
  {
    slug: "detergents",
    name: "Detergents",
    category: "cleaning-supplies",
    description: "General-purpose laundry and surface detergents for routine cleaning and laundry needs.",
    specs: [
      { label: "Format", value: STD },
      { label: "Intended use", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "disinfectants",
    name: "Disinfectants",
    category: "cleaning-supplies",
    description: "Disinfectant products for surfaces and facilities, supplied to your stated requirements.",
    specs: [
      { label: "Format", value: STD },
      { label: "Application", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "bleach",
    name: "Bleach",
    category: "cleaning-supplies",
    description: "Household and commercial bleach for sanitation and whitening applications.",
    specs: [
      { label: "Strength / type", value: STD },
      { label: "Fragrance", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "dishwashing-liquids",
    name: "Dishwashing Liquids",
    category: "cleaning-supplies",
    description: "Dishwashing liquids for kitchens, canteens and catering areas.",
    specs: [
      { label: "Format", value: STD },
      { label: "Fragrance", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "floor-cleaners",
    name: "Floor Cleaners",
    category: "cleaning-supplies",
    description: "Floor-cleaning products for offices, institutions and commercial premises.",
    specs: [
      { label: "Floor type", value: STD },
      { label: "Fragrance", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "industrial-cleaning-products",
    name: "Industrial Cleaning Products",
    category: "cleaning-supplies",
    description: "Heavier-duty cleaning products for industrial and high-traffic environments.",
    specs: [
      { label: "Application", value: STD },
      { label: "Format", value: STD },
    ],
    packaging: null,
  },

  // ---------------- Hygiene supplies ----------------
  {
    slug: "handwash",
    name: "Handwash",
    category: "hygiene-supplies",
    description: "Liquid handwash for washrooms and shared facilities.",
    specs: [
      { label: "Format", value: STD },
      { label: "Fragrance", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "hand-sanitiser",
    name: "Hand Sanitiser",
    category: "hygiene-supplies",
    description: "Hand sanitiser for entrances, reception areas and workplaces.",
    specs: [
      { label: "Format", value: STD },
      { label: "Dispenser compatibility", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "tissue-products",
    name: "Tissue Products",
    category: "hygiene-supplies",
    description: "Toilet tissue, facial tissue and paper towels for washrooms and offices.",
    specs: [
      { label: "Product type", value: STD },
      { label: "Roll / sheet format", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "bin-liners",
    name: "Bin Liners",
    category: "hygiene-supplies",
    description: "Bin liners for offices, kitchens and facility waste collection.",
    specs: [
      { label: "Size / capacity", value: STD },
      { label: "Colour", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "protective-gloves",
    name: "Protective Gloves",
    category: "hygiene-supplies",
    description: "Protective gloves for cleaning, handling and general facility work.",
    specs: [
      { label: "Material", value: STD },
      { label: "Size", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "hygiene-dispensers",
    name: "Hygiene Dispensers",
    category: "hygiene-supplies",
    description: "Dispensers for soap, sanitiser and tissue products in washrooms and common areas.",
    specs: [
      { label: "Dispenser type", value: STD },
      { label: "Mounting", value: STD },
    ],
    packaging: null,
  },

  // ---------------- Stationery and office supplies ----------------
  {
    slug: "printing-paper",
    name: "Printing Paper",
    category: "stationery-office-supplies",
    description: "Printing and photocopy paper for offices, schools and institutions.",
    specs: [
      { label: "Paper size", value: STD },
      { label: "Weight (gsm)", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "exercise-books",
    name: "Exercise Books",
    category: "stationery-office-supplies",
    description: "Exercise books for schools and learning institutions.",
    specs: [
      { label: "Page count", value: STD },
      { label: "Ruling", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "notebooks",
    name: "Notebooks",
    category: "stationery-office-supplies",
    description: "Notebooks and notepads for offices, meetings and training.",
    specs: [
      { label: "Size", value: STD },
      { label: "Binding", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "pens-and-pencils",
    name: "Pens and Pencils",
    category: "stationery-office-supplies",
    description: "Writing instruments for offices and educational institutions.",
    specs: [
      { label: "Type", value: STD },
      { label: "Colour / grade", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "files-and-folders",
    name: "Files and Folders",
    category: "stationery-office-supplies",
    description: "Filing and document-organisation products for records and administration.",
    specs: [
      { label: "Type", value: STD },
      { label: "Size", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "office-consumables",
    name: "General Office Consumables",
    category: "stationery-office-supplies",
    description: "Everyday office consumables supplied as part of regular or one-off orders.",
    specs: [
      { label: "Items required", value: STD },
      { label: "Quantities", value: STD },
    ],
    packaging: null,
  },

  // ---------------- General institutional supplies ----------------
  {
    slug: "general-purpose-consumables",
    name: "General-Purpose Consumables",
    category: "general-institutional-supplies",
    description: "General consumables for the day-to-day running of institutions and facilities.",
    specs: [
      { label: "Items required", value: STD },
      { label: "Quantities", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "operational-supplies",
    name: "Selected Operational Supplies",
    category: "general-institutional-supplies",
    description: "Selected operational supplies sourced to suit your facility or programme.",
    specs: [
      { label: "Items required", value: STD },
      { label: "Application", value: STD },
    ],
    packaging: null,
  },
  {
    slug: "sourced-to-requirement",
    name: "Products Sourced to Your Requirements",
    category: "general-institutional-supplies",
    description:
      "Need something not listed? Send us your specification or list and we will source it and quote.",
    specs: [
      { label: "Your specification", value: "Supplied by you" },
      { label: "Quotation", value: "Provided after sourcing" },
    ],
    packaging: null,
  },
];

export const getCategory = (slug: string) => categories.find((c) => c.slug === slug);
export const productsByCategory = (slug: string) => products.filter((p) => p.category === slug);
