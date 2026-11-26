import { deflateSync, inflateSync } from "node:zlib";

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/**
 * Tiny dependency-free PNG toolkit (Node only): decode, shrink and re-encode. It exists so the company logo can be
 * served at a sensible size to web pages and embedded in the PDFs. Non-interlaced PNG only; anything else
 * returns null and the caller falls back to the original bytes or the built-in logo.
 */
export type Raster = { width: number; height: number; rgba: Buffer };

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(SIG);

export function decodePng(buf: Buffer): Raster | null {
  try {
    if (!isPng(buf)) return null;
    let pos = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
    let plte: Buffer | null = null, trns: Buffer | null = null;
    const idat: Buffer[] = [];
    while (pos + 8 <= buf.length) {
      const len = buf.readUInt32BE(pos), type = buf.toString("latin1", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
      if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
      else if (type === "PLTE") plte = data; else if (type === "tRNS") trns = data; else if (type === "IDAT") idat.push(data);
      else if (type === "IEND") break;
      pos += 12 + len;
    }
    if (!w || !h || interlace !== 0 || w * h > 40_000_000) return null;
    if (![1, 2, 4, 8, 16].includes(depth)) return null;
    const chans = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ctype];
    if (!chans) return null;
    const bpp = Math.max(1, (chans * depth) >> 3); // bytes per pixel for filtering (>=1)
    const stride = Math.ceil((w * chans * depth) / 8);
    const raw = inflateSync(Buffer.concat(idat));
    if (raw.length < (stride + 1) * h) return null;
    const px = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) {
      const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? px[dst + x - bpp] : 0, b = y > 0 ? px[dst - stride + x] : 0, c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0;
        let v = raw[src + x];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        px[dst + x] = v & 255;
      }
    }
    const rgba = Buffer.alloc(w * h * 4);
    const sample = (row: number, i: number) => { // i-th sample of a row, scaled to 0..255 (palette indexes are left raw)
      if (depth === 8) return px[row + i];
      if (depth === 16) return px[row + i * 2];
      const bits = depth, per = 8 / bits, byte = px[row + Math.floor(i / per)], shift = 8 - bits * ((i % per) + 1);
      return (byte >> shift) & ((1 << bits) - 1);
    };
    const scale = depth < 8 && ctype !== 3 ? 255 / ((1 << depth) - 1) : 1;
    for (let y = 0; y < h; y++) {
      const row = y * stride;
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (ctype === 6) { for (let k = 0; k < 4; k++) rgba[o + k] = sample(row, x * 4 + k); }
        else if (ctype === 2) { for (let k = 0; k < 3; k++) rgba[o + k] = sample(row, x * 3 + k); rgba[o + 3] = 255; }
        else if (ctype === 0) { const g = Math.round(sample(row, x) * scale); rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = 255; }
        else if (ctype === 4) { const g = sample(row, x * 2); rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = sample(row, x * 2 + 1); }
        else { const i = sample(row, x); if (!plte) return null; rgba[o] = plte[i * 3]; rgba[o + 1] = plte[i * 3 + 1]; rgba[o + 2] = plte[i * 3 + 2]; rgba[o + 3] = trns && i < trns.length ? trns[i] : 255; }
      }
    }
    return { width: w, height: h, rgba };
  } catch {
    return null;
  }
}

/** Area-average shrink to at most maxW wide (alpha-weighted so transparent edges do not turn dark). */
export function shrink(r: Raster, maxW: number): Raster {
  if (r.width <= maxW) return r;
  const nw = maxW, nh = Math.max(1, Math.round((r.height * nw) / r.width));
  const out = Buffer.alloc(nw * nh * 4), fx = r.width / nw, fy = r.height / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.min(r.height, Math.ceil((y + 1) * fy)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.min(r.width, Math.ceil((x + 1) * fx)));
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * r.width + xx) * 4, a = r.rgba[i + 3];
        sr += r.rgba[i] * a; sg += r.rgba[i + 1] * a; sb += r.rgba[i + 2] * a; sa += a; n++;
      }
      const o = (y * nw + x) * 4;
      if (sa > 0) { out[o] = Math.round(sr / sa); out[o + 1] = Math.round(sg / sa); out[o + 2] = Math.round(sb / sa); }
      out[o + 3] = Math.round(sa / n);
    }
  }
  return { width: nw, height: nh, rgba: out };
}

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
export function encodePng(r: Raster): Buffer {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(r.width, 0); ihdr.writeUInt32BE(r.height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc((r.width * 4 + 1) * r.height);
  for (let y = 0; y < r.height; y++) r.rgba.copy(rows, y * (r.width * 4 + 1) + 1, y * r.width * 4, (y + 1) * r.width * 4);
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
