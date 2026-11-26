import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { createPublicClient } from "@/lib/supabase/public";
import { publicMediaUrl } from "@/lib/content/load";
import { decodePng, encodePng, isPng, shrink } from "@/lib/png";
import type { PdfImage } from "@/lib/pdf";

/**
 * The company logo, as uploaded under Website > Company ("Logo"). Everything that shows the logo (web pages, portals,
 * PDFs) reads it from here, so changing it once changes it everywhere. If none is uploaded, or it cannot be read,
 * the built-in SAMSAL logo is used, so a document never goes out without one.
 */
type Source = { bytes: Buffer; mime: string; custom: boolean };
let cache: { at: number; src: Source } | null = null;
const TTL = 5 * 60 * 1000;

async function builtIn(): Promise<Source> {
  return { bytes: await readFile(path.join(process.cwd(), "public", "logo", "samsal-logo.png")), mime: "image/png", custom: false };
}

async function source(): Promise<Source> {
  if (cache && Date.now() - cache.at < TTL) return cache.src;
  let src: Source | null = null;
  try {
    const sb = createPublicClient();
    if (sb) {
      const { data } = await sb.from("company_settings").select("logo:media_assets!company_settings_logo_media_id_fkey(bucket, storage_path, mime_type)").limit(1);
      const row = Array.isArray(data) ? data[0] : null;
      const m = row ? (Array.isArray(row.logo) ? row.logo[0] : row.logo) : null;
      const url = m ? publicMediaUrl(m) : null;
      if (url) {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
        if (res.ok) {
          const bytes = Buffer.from(await res.arrayBuffer());
          if (bytes.length > 0 && bytes.length < 12_000_000) src = { bytes, mime: m.mime_type || res.headers.get("content-type") || "image/png", custom: true };
        }
      }
    }
  } catch { /* fall back below */ }
  if (!src) src = await builtIn();
  cache = { at: Date.now(), src };
  return src;
}

/** Logo for web pages: a PNG of reasonable size (the upload is shrunk), or the original if it is not a PNG. */
export async function webLogo(): Promise<{ body: Buffer; type: string }> {
  const s = await source();
  if (isPng(s.bytes)) {
    const r = decodePng(s.bytes);
    if (r) return { body: encodePng(shrink(r, 640)), type: "image/png" };
  }
  if (s.custom && s.bytes.length < 600_000 && /^image\/(jpeg|webp|svg\+xml|png)$/.test(s.mime)) return { body: s.bytes, type: s.mime };
  const b = await builtIn();
  const r = decodePng(b.bytes);
  return r ? { body: encodePng(shrink(r, 640)), type: "image/png" } : { body: b.bytes, type: "image/png" };
}

let pdfCache: { at: number; img: PdfImage | null } | null = null;
/** Logo for PDFs (PNG only; a non-PNG upload falls back to the built-in logo). */
export async function pdfLogo(): Promise<PdfImage | null> {
  if (pdfCache && Date.now() - pdfCache.at < TTL) return pdfCache.img;
  let img: PdfImage | null = null;
  try {
    const s = await source();
    const r = (isPng(s.bytes) ? decodePng(s.bytes) : null) ?? decodePng((await builtIn()).bytes);
    if (r) {
      const t = shrink(r, 560), n = t.width * t.height;
      const rgb = Buffer.alloc(n * 3), alpha = Buffer.alloc(n);
      let translucent = false;
      for (let i = 0; i < n; i++) {
        rgb[i * 3] = t.rgba[i * 4]; rgb[i * 3 + 1] = t.rgba[i * 4 + 1]; rgb[i * 3 + 2] = t.rgba[i * 4 + 2];
        alpha[i] = t.rgba[i * 4 + 3]; if (alpha[i] !== 255) translucent = true;
      }
      img = { width: t.width, height: t.height, rgb: deflateSync(rgb, { level: 9 }), alpha: translucent ? deflateSync(alpha, { level: 9 }) : null };
    }
  } catch { img = null; }
  pdfCache = { at: Date.now(), img };
  return img;
}

/** Draws the logo at the top-left of a PDF page, at most `h` points tall. Returns the width used (0 when there is no logo). */
export function placeLogo(doc: { image: (x: number, y: number, w: number, h: number, img: PdfImage) => void; left: number; y: number }, img: PdfImage | null | undefined, h = 46, maxW = 200): number {
  if (!img) return 0;
  const w = Math.min(maxW, (h * img.width) / img.height), hh = (w * img.height) / img.width;
  doc.image(doc.left, doc.y - hh, w, hh, img);
  return w;
}
