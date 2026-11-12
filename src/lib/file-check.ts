/**
 * Server-side attachment inspection.
 *
 * A file name or browser-declared MIME type can be faked, so we also inspect the
 * actual bytes ("magic numbers") and require that the content matches the
 * extension. Anything that does not match is rejected.
 *
 * This is a defence-in-depth check, not antivirus. Attachments are only forwarded
 * by email and are never stored or served by this site.
 */
import { LIMITS, fileExtension } from "@/lib/validation";

type Kind = "pdf" | "png" | "jpeg" | "zip" | "ole" | "text";

/** extension -> expected content kind and acceptable declared MIME types */
const RULES: Record<string, { kind: Kind; mime: string[] }> = {
  pdf: { kind: "pdf", mime: ["application/pdf"] },
  png: { kind: "png", mime: ["image/png"] },
  jpg: { kind: "jpeg", mime: ["image/jpeg"] },
  jpeg: { kind: "jpeg", mime: ["image/jpeg"] },
  docx: { kind: "zip", mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  xlsx: { kind: "zip", mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] },
  doc: { kind: "ole", mime: ["application/msword"] },
  xls: { kind: "ole", mime: ["application/vnd.ms-excel"] },
  csv: { kind: "text", mime: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"] },
  txt: { kind: "text", mime: ["text/plain"] },
};

/** Browsers/OSes sometimes send these generic values; the byte check still applies. */
const GENERIC_MIME = new Set(["", "application/octet-stream"]);

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

function matchesKind(kind: Kind, b: Uint8Array): boolean {
  switch (kind) {
    case "pdf":
      // "%PDF-" may be preceded by a few bytes of junk per the spec; allow within the first 1024 bytes
      return Buffer.from(b.subarray(0, 1024)).includes("%PDF-");
    case "png":
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return startsWith(b, [0xff, 0xd8, 0xff]);
    case "zip":
      return startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
    case "ole":
      return startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "text": {
      // Plain text: no NUL/control bytes and valid UTF-8 (BOM allowed).
      const sample = b.subarray(0, Math.min(b.length, 64 * 1024));
      for (const byte of sample) {
        if (byte === 0 || (byte < 9) || (byte > 13 && byte < 32 && byte !== 27)) return false;
      }
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(sample);
        return true;
      } catch {
        // a multibyte character may be cut at the sample boundary; retry without the last 3 bytes
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, Math.max(0, sample.length - 3)));
          return b.length > sample.length;
        } catch {
          return false;
        }
      }
    }
  }
}

/** For DOCX/XLSX: a real Office Open XML package contains [Content_Types].xml in its first entries. */
function looksLikeOfficePackage(b: Uint8Array): boolean {
  return Buffer.from(b.subarray(0, Math.min(b.length, 4096))).includes("[Content_Types].xml");
}

export type FileCheck = { ok: true; name: string; size: number } | { ok: false; error: string };

export async function inspectAttachment(file: File): Promise<FileCheck> {
  if (file.size === 0) return { ok: false, error: "The attached file is empty." };
  if (file.size > LIMITS.maxFileBytes) return { ok: false, error: "File is too large. Maximum size is 4 MB." };

  const ext = fileExtension(file.name);
  const rule = RULES[ext];
  if (!rule) {
    return { ok: false, error: `Unsupported file type. Allowed: ${LIMITS.allowedExtensions.join(", ").toUpperCase()}.` };
  }

  const declared = (file.type || "").toLowerCase().split(";")[0].trim();
  if (!GENERIC_MIME.has(declared) && !rule.mime.includes(declared)) {
    return { ok: false, error: "The file type does not match its extension." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > LIMITS.maxFileBytes) return { ok: false, error: "File is too large. Maximum size is 4 MB." };

  if (!matchesKind(rule.kind, bytes)) {
    return { ok: false, error: "The file content does not match its type. Please attach a genuine file." };
  }
  if (rule.kind === "zip" && !looksLikeOfficePackage(bytes)) {
    return { ok: false, error: "The file does not look like a valid Word or Excel document." };
  }

  return { ok: true, name: file.name, size: bytes.length };
}
