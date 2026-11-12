/**
 * PHOTOGRAPHY SLOTS
 * -----------------
 * No stock photography is bundled (none could be licensed or verified in this build).
 * Where a slot is `null` the site shows a clean branded panel instead of a broken image.
 *
 * To add a photo:
 *   1. Drop the file into /public/images (JPG/WebP, ideally 1600px wide or more).
 *   2. Set `src` below to e.g. "/images/warehouse.jpg" and write a descriptive `alt`.
 * Photos are optimised and served responsively automatically (next/image).
 *
 * Use only photos you own or have licensed - ideally real SAMSAL operations.
 */
export type PhotoSlot = { src: string; alt: string } | null;

export const photos: Record<string, PhotoSlot> = {
  hero: null, // wide warehouse / distribution scene
  introduction: null, // team or goods-handling scene
  cta: null,
  // Category photos, keyed by category slug
  "cleaning-supplies": null,
  "hygiene-supplies": null,
  "stationery-office-supplies": null,
  "general-institutional-supplies": null,
  // Industry photos, keyed by industry slug
  "corporate-offices": null,
  "educational-institutions": null,
  "hospitality-businesses": null,
  "property-management": null,
  "ngos-development-organisations": null,
  "government-public-institutions": null,
};
