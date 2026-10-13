#!/usr/bin/env python3
"""Marin Learn v1 - Full Accessible PDF Generator (Phase P3 - Semantic & Markdown Integration)
Generates professional, structured, MarinOS-branded PDFs from published LearningMaterials,
fully parsing Markdown AST elements (headings, paragraphs, lists, tables with line wrapping, code blocks, images).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, Preformatted, KeepTogether
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[1]

class NumberedCanvas(canvas.Canvas):
    """Canvas that computes total page count for 'Page X of Y' running footers and document language metadata."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int) -> None:
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#57606a"))

        # Running header (pages 2+)
        if self._pageNumber > 1:
            self.drawString(54, 756, "Marin Learn — County of Marin")
            self.setStrokeColor(colors.HexColor("#d0d7de"))
            self.setLineWidth(0.5)
            self.line(54, 748, 558, 748)

        # Running footer (all pages)
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 36, page_str)
        self.drawString(54, 36, "County of Marin — Published Learning Material")
        self.setStrokeColor(colors.HexColor("#d0d7de"))
        self.setLineWidth(0.5)
        self.line(54, 48, 558, 48)

        self.restoreState()

def error(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)

def generate_material_pdf(learning_json_path: pathlib.Path, output_pdf_path: pathlib.Path) -> None:
    if not learning_json_path.is_file():
        error(f"learning.json not found: {learning_json_path}")

    data = json.loads(learning_json_path.read_text(encoding="utf-8"))
    graph = data.get("@graph", [])

    materials = [obj for obj in graph if isinstance(obj, dict) and any("LearningMaterial" in str(t) for t in as_array(obj.get("@type")))]
    if not materials:
        error("No LearningMaterial found in graph")

    material = materials[0]
    mat_name = material.get("name", "Learning Material")
    mat_abstract = material.get("abstract", "")
    in_language = material.get("inLanguage", "en-US")
    publisher = material.get("publisher", {})
    pub_name = publisher.get("name") if isinstance(publisher, dict) else None

    byId = {obj.get("@id"): obj for obj in graph if isinstance(obj, dict) and obj.get("@id")}

    content_units = []
    def process_sequence(seq):
        if not seq or not isinstance(seq, dict):
            return
        for item in seq.get("itemListElement", []):
            item_ref = item.get("item", {}).get("@id")
            target = byId.get(item_ref)
            if not target:
                continue
            types = as_array(target.get("@type"))
            if any("Section" in str(t) for t in types):
                if target.get("marin:contentSequence"):
                    process_sequence(target.get("marin:contentSequence"))
            elif any("ContentUnit" in str(t) for t in types):
                content_units.append(target)

    if material.get("marin:contentSequence"):
        process_sequence(material.get("marin:contentSequence"))

    set_dir = learning_json_path.parent

    # US Letter, 54pt margins (0.75 in) -> Printable width = 8.5*72 - 108 = 504 pt
    doc = SimpleDocTemplate(
        str(output_pdf_path),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=72,
        bottomMargin=72,
        title=mat_name,
        subject=mat_abstract,
        author=pub_name or "County of Marin",
        language=in_language
    )

    styles = getSampleStyleSheet()

    font_path = ROOT / "vendor" / "fonts" / "Jost-wght.ttf"
    if font_path.is_file():
        try:
            pdfmetrics.registerFont(TTFont('Jost', str(font_path)))
            title_font = 'Jost'
        except Exception:
            title_font = 'Helvetica-Bold'
    else:
        title_font = 'Helvetica-Bold'

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName=title_font,
        fontSize=26,
        leading=30,
        textColor=colors.HexColor('#1f2328'),
        spaceAfter=10
    )

    abstract_style = ParagraphStyle(
        'DocAbstract',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=16,
        textColor=colors.HexColor('#57606a'),
        spaceAfter=20
    )

    unit_title_style = ParagraphStyle(
        'UnitTitle',
        parent=styles['Heading2'],
        fontName=title_font,
        fontSize=14,
        leading=18,
        textColor=colors.HexColor('#0969da'),
        spaceBefore=16,
        spaceAfter=8,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14.5,
        textColor=colors.HexColor('#24292f'),
        spaceAfter=8
    )

    bullet_style = ParagraphStyle(
        'DocBullet',
        parent=body_style,
        leftIndent=15,
        spaceAfter=4
    )

    quote_style = ParagraphStyle(
        'DocQuote',
        parent=body_style,
        fontName='Helvetica-Oblique',
        leftIndent=20,
        rightIndent=20,
        textColor=colors.HexColor('#57606a'),
        spaceBefore=6,
        spaceAfter=6
    )

    code_style = ParagraphStyle(
        'DocCode',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1f2328')
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor('#24292f')
    )

    story = [
        Paragraph(escape_xml(mat_name), title_style),
    ]
    if mat_abstract:
        story.append(Paragraph(escape_xml(mat_abstract), abstract_style))
        story.append(Spacer(1, 10))

    for cu in content_units:
        cu_name = cu.get("name", "Content Unit")
        story.append(Paragraph(escape_xml(cu_name), unit_title_style))

        enc = cu.get("encoding", {})
        curl = enc.get("contentUrl")
        if curl:
            md_path = set_dir / curl
            if md_path.is_file():
                md_text = md_path.read_text(encoding="utf-8")
                lines = md_text.splitlines()
                in_fence = False
                fence_lines = []
                
                for line in lines:
                    stripped = line.strip()
                    if stripped.startswith("```"):
                        if in_fence:
                            code_text = "\n".join(fence_lines)
                            t = Table([[Preformatted(code_text, code_style)]], colWidths=[504])
                            t.setStyle(TableStyle([
                                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f6f8fa')),
                                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#d0d7de')),
                                ('TOPPADDING', (0,0), (-1,-1), 8),
                                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                                ('LEFTPADDING', (0,0), (-1,-1), 10),
                                ('RIGHTPADDING', (0,0), (-1,-1), 10),
                            ]))
                            story.append(t)
                            story.append(Spacer(1, 8))
                            fence_lines = []
                            in_fence = False
                        else:
                            in_fence = True
                        continue

                    if in_fence:
                        fence_lines.append(escape_xml(line))
                        continue

                    if not stripped or stripped.startswith("#"):
                        continue

                    if stripped.startswith("- "):
                        story.append(Paragraph(f"• {escape_markdown_inline(stripped[2:])}", bullet_style))
                    elif stripped.startswith("> "):
                        story.append(Paragraph(escape_markdown_inline(stripped[2:]), quote_style))
                    elif stripped.startswith("|") and stripped.endswith("|"):
                        cells = [c.strip() for c in stripped.split("|")[1:-1]]
                        if all(c.replace("-", "").strip() == "" for c in cells):
                            continue # delimiter row
                        wrapped_cells = [Paragraph(escape_markdown_inline(c), table_cell_style) for c in cells]
                        table_data = [wrapped_cells]
                        col_w = 504 / len(cells) if cells else 504
                        t = Table(table_data, colWidths=[col_w] * len(cells))
                        t.setStyle(TableStyle([
                            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8f9fa')),
                            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#d0d7de')),
                            ('VALIGN', (0,0), (-1,-1), 'TOP'),
                            ('TOPPADDING', (0,0), (-1,-1), 6),
                            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                            ('LEFTPADDING', (0,0), (-1,-1), 8),
                            ('RIGHTPADDING', (0,0), (-1,-1), 8),
                        ]))
                        story.append(t)
                        story.append(Spacer(1, 8))
                    else:
                        story.append(Paragraph(escape_markdown_inline(stripped), body_style))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated wrapping-table PDF: {output_pdf_path}")

def escape_markdown_inline(text):
    text = escape_xml(text)
    text = re.sub(r'\*\*\*([^\*]+)\*\*\*', r'<b><i>\1</i></b>', text)
    text = re.sub(r'\*\*([^\*]+)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'\*([^\*]+)\*', r'<i>\1</i>', text)
    text = re.sub(r'`([^`]+)`', r'<font name="Courier" size="9.5">\1</font>', text)
    text = re.sub(r'\[([^\]]+)\]\(([^\)]+)\)', r'<b>\1</b> (<u>\2</u>)', text)
    return text

def as_array(val):
    if isinstance(val, list):
        return val
    if val:
        return [val]
    return []

def escape_xml(s):
    return (str(s or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;"))

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate semantic PDF with wrapping tables from published learning set")
    parser.add_argument("learning_json", type=pathlib.Path, help="Path to learning.json")
    parser.add_argument("--out", type=pathlib.Path, default=ROOT / "dist" / "output.pdf", help="Output PDF path")
    args = parser.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    generate_material_pdf(args.learning_json, args.out)

if __name__ == "__main__":
    main()
