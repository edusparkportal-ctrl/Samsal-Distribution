/**
 * Minimal dependency-free PDF writer (A4, Helvetica, WinAnsi). Enough for quotations:
 * text, rules, filled boxes, simple tables, wrapping and automatic page breaks.
 * Non-Latin-1 characters are replaced with "?" rather than producing a corrupt file.
 */
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 48;

// Helvetica / Helvetica-Bold advance widths for ASCII 32..126 (per 1000 em)
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

export function sanitise(s: string): string {
  return s.replace(/[\r\t]/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "?");
}
const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
export function textWidth(s: string, size: number, bold = false): number {
  const t = bold ? HELV_B : HELV;
  let w = 0;
  for (const ch of s) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? t[c - 32] : 556; }
  return (w * size) / 1000;
}
export function wrap(text: string, maxW: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of sanitise(text).split("\n")) {
    let line = "";
    for (const word of para.split(/ +/)) {
      let w = word;
      while (textWidth(w, size, bold) > maxW && w.length > 1) { // break very long words
        let cut = w.length - 1;
        while (cut > 1 && textWidth(w.slice(0, cut), size, bold) > maxW) cut--;
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, cut)); w = w.slice(cut);
      }
      const cand = line ? `${line} ${w}` : w;
      if (textWidth(cand, size, bold) <= maxW) line = cand; else { if (line) out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

type RGB = [number, number, number];
const rgb = (c: RGB) => c.map((x) => (x / 255).toFixed(3)).join(" ");

export class PdfDoc {
  private pages: string[] = [];
  private cur = "";
  y = PAGE_H - MARGIN;
  readonly left = MARGIN;
  readonly right = PAGE_W - MARGIN;
  readonly width = PAGE_W - 2 * MARGIN;
  constructor(private footer: string = "") { this.newPage(); }

  private newPage() { if (this.cur) this.pages.push(this.cur); this.cur = ""; this.y = PAGE_H - MARGIN; }
  ensure(h: number) { if (this.y - h < MARGIN + 24) this.newPage(); }
  text(x: number, y: number, s: string, size = 10, bold = false, color: RGB = [38, 50, 56], align: "l" | "r" = "l") {
    const t = sanitise(s);
    const px = align === "r" ? x - textWidth(t, size, bold) : x;
    this.cur += `BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb(color)} rg ${px.toFixed(2)} ${y.toFixed(2)} Td (${esc(t)}) Tj ET\n`;
  }
  rect(x: number, y: number, w: number, h: number, fill: RGB) { this.cur += `${rgb(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`; }
  rule(y: number, color: RGB = [200, 207, 214]) { this.cur += `${rgb(color)} RG 0.5 w ${this.left} ${y.toFixed(2)} m ${this.right} ${y.toFixed(2)} l S\n`; }
  hline(x1: number, x2: number, y: number, color: RGB = [120, 130, 140]) { this.cur += `${rgb(color)} RG 0.6 w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S\n`; }
  frame(x: number, y: number, w: number, h: number, color: RGB = [150, 160, 170]) { this.cur += `${rgb(color)} RG 0.6 w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`; }
  /** Wrapped paragraph; returns nothing, advances this.y. */
  para(s: string, size = 10, bold = false, color: RGB = [38, 50, 56], maxW = this.width, x = this.left) {
    const lh = size * 1.35;
    for (const ln of wrap(s, maxW, size, bold)) { this.ensure(lh); this.y -= lh; this.text(x, this.y, ln, size, bold, color); }
  }
  gap(h: number) { this.y -= h; if (this.y < MARGIN + 24) this.newPage(); }

  /** Table. cols: widths summing to this.width; align per column. */
  table(head: string[], rows: string[][], cols: number[], align: ("l" | "r")[], size = 9) {
    const pad = 5, lh = size * 1.3;
    const drawHead = () => {
      this.ensure(lh + 2 * pad);
      this.rect(this.left, this.y - lh - 2 * pad, this.width, lh + 2 * pad, [20, 45, 78]);
      let x = this.left;
      head.forEach((h, i) => { this.text(align[i] === "r" ? x + cols[i] - pad : x + pad, this.y - pad - size, h, size, true, [255, 255, 255], align[i]); x += cols[i]; });
      this.y -= lh + 2 * pad;
    };
    drawHead();
    rows.forEach((r, idx) => {
      const cells = r.map((c, i) => wrap(c, cols[i] - 2 * pad, size));
      const h = Math.max(...cells.map((c) => c.length)) * lh + 2 * pad;
      if (this.y - h < MARGIN + 24) { this.newPage(); drawHead(); }
      if (idx % 2 === 1) this.rect(this.left, this.y - h, this.width, h, [244, 246, 248]);
      let x = this.left;
      cells.forEach((lines, i) => {
        lines.forEach((ln, k) => this.text(align[i] === "r" ? x + cols[i] - pad : x + pad, this.y - pad - size - k * lh + 1, ln, size, false, [38, 50, 56], align[i]));
        x += cols[i];
      });
      this.y -= h;
    });
    this.rule(this.y);
  }

  build(): Buffer {
    if (this.cur || this.pages.length === 0) this.pages.push(this.cur);
    const total = this.pages.length;
    const objs: string[] = [];
    // 1 catalog, 2 pages, 3 F1, 4 F2, then per page: page obj + content obj
    const kids: number[] = [];
    const bodies: string[] = [];
    this.pages.forEach((content, i) => {
      const footer = `BT /F1 8 Tf 0.42 0.47 0.52 rg ${MARGIN} 28 Td (${esc(sanitise(this.footer))}) Tj ET\nBT /F1 8 Tf 0.42 0.47 0.52 rg ${(PAGE_W - MARGIN - 60).toFixed(2)} 28 Td (Page ${i + 1} of ${total}) Tj ET\n`;
      const stream = content + footer;
      const pageNo = 5 + i * 2, contentNo = 6 + i * 2;
      kids.push(pageNo);
      bodies.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNo} 0 R >>`);
      bodies.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`);
    });
    objs.push("<< /Type /Catalog /Pages 2 0 R >>");
    objs.push(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${total} >>`);
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    objs.push(...bodies);
    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets: number[] = [];
    objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
  }
}
