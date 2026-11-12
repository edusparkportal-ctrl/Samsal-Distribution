/**
 * CENTRAL IMAGE CONFIGURATION
 * ---------------------------
 * Every image on the site is referenced from this one file.
 *
 * WHAT IS HERE NOW
 * The current images are original vector ILLUSTRATIONS drawn for SAMSAL in the brand
 * palette (public/images/illustrations). They are placeholders that carry no licensing
 * risk. They are NOT photography.
 *
 * HOW TO SWITCH TO REAL PHOTOGRAPHY
 *   1. Put your licensed or own photos in /public/images/photos (JPG/WebP, 1600 px wide or more).
 *   2. Change the `src` and `alt` of the matching entry below, e.g.
 *        hero: { src: "/images/photos/warehouse.jpg", alt: "Cartons stacked in a Nairobi warehouse" }
 *   3. Optional: give a single product its own photo in `productPhotos` (keyed by product slug).
 * Photos are resized and served as AVIF/WebP automatically (next/image).
 * See docs/PHOTOGRAPHY.md for a shot list, sizes and licensing guidance.
 *
 * Setting an entry to `null` shows a plain branded panel instead.
 */
export type PhotoSlot = { src: string; alt: string } | null;

const ill = (file: string) => `/images/illustrations/${file}.svg`;

export const photos: Record<string, PhotoSlot> = {
  hero: { src: ill("hero-distribution"), alt: "Illustration of a delivery truck beside cartons stacked on a pallet" },
  introduction: { src: ill("general-institutional-supplies"), alt: "Illustration of boxed supplies stacked on a pallet" },
  cta: null,

  // Category images, keyed by category slug (also used on product cards)
  "cleaning-supplies": {
    src: ill("cleaning-supplies"),
    alt: "Illustration of cleaning supplies: detergent bottle, spray bottle and bucket",
  },
  "hygiene-supplies": {
    src: ill("hygiene-supplies"),
    alt: "Illustration of hygiene supplies: pump soap bottle, tissue rolls and a wall dispenser",
  },
  "stationery-office-supplies": {
    src: ill("stationery-office-supplies"),
    alt: "Illustration of stationery: notebooks, a ream of paper and a pen holder",
  },
  "general-institutional-supplies": {
    src: ill("general-institutional-supplies"),
    alt: "Illustration of boxed supplies stacked on a pallet",
  },

  // Industry images, keyed by industry slug (null = icon panel)
  "corporate-offices": null,
  "educational-institutions": null,
  "hospitality-businesses": null,
  "property-management": null,
  "ngos-development-organisations": null,
  "government-public-institutions": null,
};

/** Optional per-product photos, keyed by product slug. Falls back to the category image. */
export const productPhotos: Record<string, PhotoSlot> = {};
