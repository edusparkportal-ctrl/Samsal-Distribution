/**
 * Media rules shared by the upload UI and the server-side registration check.
 * Pure functions (no Next.js / Supabase) so they can be unit-tested.
 *
 * Nothing the browser says about a file is trusted: the server re-downloads the stored object and
 * checks its size and real content bytes against the extension (see inspectBytes).
 * SVG is not accepted: it can carry scripts.
 */
export type BucketId = "public-media" | "private-docs";

type Rule = { mime: string; kind: "jpeg" | "png" | "webp" | "pdf" | "zip" | "text" };
const R = {
  jpg: { mime: "image/jpeg", kind: "jpeg" }, jpeg: { mime: "image/jpeg", kind: "jpeg" },
  png: { mime: "image/png", kind: "png" }, webp: { mime: "image/webp", kind: "webp" },
  pdf: { mime: "application/pdf", kind: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "zip" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "zip" },
  csv: { mime: "text/csv", kind: "text" }, txt: { mime: "text/plain", kind: "text" },
} as const satisfies Record<string, Rule>;

export const BUCKETS: Record<BucketId, { maxBytes: number; exts: (keyof typeof R)[]; label: string }> = {
  "public-media": { maxBytes: 5 * 1024 * 1024, exts: ["jpg", "jpeg", "png", "webp", "pdf"], label: "JPG, PNG, WebP or PDF up to 5 MB" },
  "private-docs": { maxBytes: 10 * 1024 * 1024, exts: ["pdf", "jpg", "jpeg", "png", "docx", "xlsx", "csv", "txt"], label: "PDF, JPG, PNG, DOCX, XLSX, CSV or TXT up to 10 MB" },
};

export const FOLDER_RE = /^[a-z0-9_-]{1,40}$/;
export const STORAGE_PATH_RE = /^[a-z0-9_-]{1,40}\/\d{6}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9][a-z0-9._-]{0,120}$/;

const baseName = (name: string) => name.split(/[\\/]/).pop() ?? "";
export const extensionOf = (name: string) => {
  const base = baseName(name);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
};

/** A readable, URL-safe name: "Floor Cleaner (500ml).JPG" -> "floor-cleaner-500ml.jpg". */
export function safeStorageName(original: string): string {
  const base = baseName(original);
  const ext = extensionOf(base);
  const stem = base.slice(0, base.length - (ext ? ext.length + 1 : 0))
    .toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  return ext ? `${stem}.${ext.replace(/[^a-z0-9]/g, "")}` : stem;
}

export const buildStoragePath = (folder: string, original: string, uuid: string, now = new Date()) =>
  `${folder}/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}/${uuid}-${safeStorageName(original)}`;

/** Quick checks the browser can do before uploading (the server repeats and tightens them). */
export function precheck(bucket: BucketId, fileName: string, size: number): string | null {
  const rule = BUCKETS[bucket];
  const ext = extensionOf(fileName);
  if (!rule.exts.includes(ext as never)) return `That file type is not allowed. Use ${rule.label}.`;
  if (size <= 0) return "The file is empty.";
  if (size > rule.maxBytes) return `That file is too large. ${rule.label}.`;
  return null;
}

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const has = (b: Uint8Array, text: string, upTo: number) => Buffer.from(b.subarray(0, Math.min(b.length, upTo))).includes(text);

export type Inspect = { ok: true; mime: string; ext: string } | { ok: false; error: string };

export function inspectBytes(bucket: BucketId, fileName: string, bytes: Uint8Array): Inspect {
  const pre = precheck(bucket, fileName, bytes.length);
  if (pre) return { ok: false, error: pre };
  const ext = extensionOf(fileName) as keyof typeof R;
  const rule = R[ext];
  let genuine = false;
  switch (rule.kind) {
    case "jpeg": genuine = starts(bytes, [0xff, 0xd8, 0xff]); break;
    case "png": genuine = starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); break;
    case "webp": genuine = starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8); break;
    case "pdf": genuine = has(bytes, "%PDF-", 1024); break;
    case "zip": genuine = starts(bytes, [0x50, 0x4b, 0x03, 0x04]) && has(bytes, "[Content_Types].xml", 4096); break;
    case "text": {
      const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
      genuine = !sample.some((c) => c === 0 || (c < 9) || (c > 13 && c < 32 && c !== 27));
      if (genuine) { try { new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, sample.length === bytes.length ? sample.length : Math.max(0, sample.length - 3))); } catch { genuine = false; } }
      break;
    }
  }
  if (!genuine) return { ok: false, error: "The file content does not match its type. Upload a genuine file." };
  return { ok: true, mime: rule.mime, ext };
}
