#!/usr/bin/env python3
"""
Builds the downloadable legal documents (Word + PDF) from the Markdown sources in docs/legal/.

  python3 scripts/build-legal-docs.py

Edit the Markdown (or have your adviser edit the .docx and copy changes back), re-run, and commit
the regenerated files in public/legal/. Needs: python-docx and LibreOffice (soffice) for the PDF.

Markdown subset understood: front matter (--- key: value ---), # / ## headings, paragraphs,
"- " bullets, "> " call-out, simple | tables |, **bold**, and [[placeholder]] which is rendered in
square brackets with a yellow highlight so unresolved items are impossible to miss.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_BREAK, WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "legal"
OUT = ROOT / "public" / "legal"
COMPANY = "SAMSAL Supply & Distribution Limited"
NAVY, TEAL, GREY = RGBColor(0x14, 0x2D, 0x4E), RGBColor(0x08, 0x6F, 0x69), RGBColor(0x5B, 0x67, 0x73)
FONT = "Arial"


def shade(cell_or_par, hex_fill):
    el = cell_or_par._tc if hasattr(cell_or_par, "_tc") else cell_or_par._p
    pr = el.get_or_add_tcPr() if hasattr(cell_or_par, "_tc") else el.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    pr.append(shd)


def border(paragraph, side, color="0B8F87", size=8, space=4):
    pPr = paragraph._p.get_or_add_pPr()
    b = pPr.find(qn("w:pBdr"))
    if b is None:
        b = OxmlElement("w:pBdr")
        pPr.append(b)
    e = OxmlElement(f"w:{side}")
    e.set(qn("w:val"), "single")
    e.set(qn("w:sz"), str(size))
    e.set(qn("w:space"), str(space))
    e.set(qn("w:color"), color)
    b.append(e)


def field(run, code):
    for kind, text in (("begin", None), (None, code), ("end", None)):
        if kind:
            f = OxmlElement("w:fldChar")
            f.set(qn("w:fldCharType"), kind)
            run._r.append(f)
        else:
            t = OxmlElement("w:instrText")
            t.set(qn("xml:space"), "preserve")
            t.text = text
            run._r.append(t)


TOKEN = re.compile(r"(\*\*.+?\*\*|\[\[.+?\]\])")


def inline(par, text, size=None, color=None, bold=None):
    for part in TOKEN.split(text):
        if not part:
            continue
        if part.startswith("**"):
            r = par.add_run(part[2:-2])
            r.bold = True
        elif part.startswith("[["):
            r = par.add_run("[" + part[2:-2] + "]")
            r.font.highlight_color = WD_COLOR_INDEX.YELLOW
        else:
            r = par.add_run(part)
            if bold:
                r.bold = True
        r.font.name = FONT
        r._r.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), FONT)
        if size:
            r.font.size = Pt(size)
        if color is not None and not part.startswith("[["):
            r.font.color.rgb = color


def fmt(par, before=0, after=6, line=1.25, left=None, first=None, keep_next=False):
    pf = par.paragraph_format
    pf.space_before, pf.space_after, pf.line_spacing = Pt(before), Pt(after), line
    if left is not None:
        pf.left_indent = Cm(left)
    if first is not None:
        pf.first_line_indent = Cm(first)
    pf.keep_with_next = keep_next


def parse(md):
    meta, body = {}, md
    m = re.match(r"^---\n(.*?)\n---\n", md, re.S)
    if m:
        for line in m.group(1).splitlines():
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
        body = md[m.end():]
    return meta, body


def build(md_path):
    meta, body = parse(md_path.read_text(encoding="utf-8"))
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.3)
    sec.top_margin, sec.bottom_margin = Cm(2.4), Cm(2.2)
    st = doc.styles["Normal"]
    st.font.name, st.font.size = FONT, Pt(10.5)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    for name in ("Header", "Footer"):  # so page-number fields match the surrounding 8pt text
        doc.styles[name].font.size = Pt(8)
        doc.styles[name].font.name = FONT
        doc.styles[name].font.color.rgb = GREY
    doc.core_properties.title = f"{COMPANY} - {meta['title']} (DRAFT)"
    doc.core_properties.author = COMPANY
    doc.core_properties.subject = "Draft for legal review"

    # header / footer
    hp = sec.header.paragraphs[0]
    inline(hp, f"{COMPANY}  |  {meta['title']}  |  DRAFT FOR LEGAL REVIEW", size=8, color=GREY)
    border(hp, "bottom", "CBD3DB", 4, 4)
    fp = sec.footer.paragraphs[0]
    inline(fp, f"Version {meta['version']}  |  {meta['date']}  |  Page ", size=8, color=GREY)
    r = fp.add_run(); r.font.size = Pt(8); r.font.color.rgb = GREY; field(r, "PAGE")
    inline(fp, " of ", size=8, color=GREY)
    r = fp.add_run(); r.font.size = Pt(8); r.font.color.rgb = GREY; field(r, "NUMPAGES")

    # title block
    p = doc.add_paragraph(); inline(p, COMPANY.upper(), size=9, color=TEAL, bold=True); fmt(p, 0, 4)
    p = doc.add_paragraph(); inline(p, meta["title"], size=26, color=NAVY, bold=True); fmt(p, 0, 2, 1.0)
    p = doc.add_paragraph(); inline(p, meta.get("subtitle", ""), size=13, color=GREY); fmt(p, 0, 14, 1.0)
    border(p, "bottom", "0B8F87", 12, 8)

    lines = body.splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        if ln.startswith("> "):  # call-out
            text = ln[2:]
            t = doc.add_table(rows=1, cols=1)
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            c = t.rows[0].cells[0]
            shade(c, "FFF4DE")
            tcPr = c._tc.get_or_add_tcPr()
            bd = OxmlElement("w:tcBorders")
            for side, sz, col in (("left", 24, "F2A541"), ("top", 4, "F2A541"), ("bottom", 4, "F2A541"), ("right", 4, "F2A541")):
                e = OxmlElement(f"w:{side}"); e.set(qn("w:val"), "single"); e.set(qn("w:sz"), str(sz)); e.set(qn("w:color"), col); bd.append(e)
            tcPr.append(bd)
            cp = c.paragraphs[0]; inline(cp, text, size=9.5, color=NAVY); fmt(cp, 4, 4, 1.2)
            sp = doc.add_paragraph(); fmt(sp, 0, 4)
            i += 1
        elif ln.startswith("|"):  # table
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            ncol = len(rows[0])
            t = doc.add_table(rows=len(rows), cols=ncol)
            t.style = "Table Grid"
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            t.autofit = False  # fixed layout so the column widths below are honoured
            total = 16.4
            widths = {2: [5.2, 11.2], 3: [4.2, 7.2, 5.0]}.get(ncol, [total / ncol] * ncol)
            if ncol == 2 and rows[0][0] == "Provider":
                widths = [4.4, 12.0]
            if ncol == 2 and rows[0][0] == "Information":
                widths = [8.2, 8.2]
            for ci, w in enumerate(widths):
                t.columns[ci].width = Cm(w)
            for ri, row in enumerate(rows):
                trPr = t.rows[ri]._tr.get_or_add_trPr()
                trPr.append(OxmlElement("w:cantSplit"))  # never split a row across pages
                if ri == 0:
                    trPr.append(OxmlElement("w:tblHeader"))  # repeat the header row on each page
                for ci, text in enumerate(row):
                    cell = t.rows[ri].cells[ci]
                    cell.width = Cm(widths[ci])
                    cp = cell.paragraphs[0]
                    fmt(cp, 3, 3, 1.15)
                    if ri == 0:
                        shade(cell, "142D4E")
                        inline(cp, text, size=9.5, color=RGBColor(255, 255, 255), bold=True)
                    else:
                        if ci == 0:
                            shade(cell, "F4F6F8")
                        inline(cp, text, size=9.5, bold=(ci == 0 and ncol == 2 and False))
            sp = doc.add_paragraph(); fmt(sp, 0, 6)
        elif ln.startswith("# "):
            title = ln[2:]
            p = doc.add_paragraph()
            if title.lower().startswith("drafting notes"):
                p.add_run().add_break(WD_BREAK.PAGE)
            inline(p, title, size=15, color=NAVY, bold=True)
            fmt(p, 16, 6, 1.1, keep_next=True)
            border(p, "bottom", "CBD3DB", 6, 3)
            i += 1
        elif ln.startswith("## "):
            p = doc.add_paragraph(); inline(p, ln[3:], size=12, color=NAVY, bold=True); fmt(p, 12, 4, 1.1, keep_next=True)
            i += 1
        elif ln.startswith("- "):
            p = doc.add_paragraph(style="List Bullet"); inline(p, ln[2:]); fmt(p, 0, 3, 1.2, left=1.0, first=-0.5)
            i += 1
        else:
            m = re.match(r"^(\d+\.\d+)\s+(.*)$", ln)
            p = doc.add_paragraph()
            if m:
                r = p.add_run(m.group(1) + "  "); r.bold = True; r.font.color.rgb = TEAL; r.font.name = FONT
                inline(p, m.group(2))
                fmt(p, 0, 6, 1.25, left=1.1, first=-1.1)
            else:
                inline(p, ln); fmt(p, 0, 6)
            i += 1

    OUT.mkdir(parents=True, exist_ok=True)
    docx_path = OUT / f"{meta['filename']}.docx"
    doc.save(docx_path)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", tmp, str(docx_path)], check=True, capture_output=True, timeout=180)
        shutil.move(str(Path(tmp) / f"{meta['filename']}.pdf"), str(OUT / f"{meta['filename']}.pdf"))
    print("built", docx_path.name, "and", f"{meta['filename']}.pdf")


if __name__ == "__main__":
    if shutil.which("soffice") is None:
        sys.exit("LibreOffice (soffice) is required to make the PDF.")
    for f in sorted(SRC.glob("*.md")):
        build(f)
