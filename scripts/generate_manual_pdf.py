from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "manual-didatico-serv3.md"
OUTPUT = ROOT / "docs" / "Guia_Treinamento_Serv3.pdf"


def clean_inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ManualTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=27,
            textColor=colors.HexColor("#2f2a24"),
            spaceAfter=14,
            alignment=TA_LEFT,
        ),
        "h1": ParagraphStyle(
            "ManualH1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#4d3822"),
            spaceBefore=14,
            spaceAfter=7,
        ),
        "h2": ParagraphStyle(
            "ManualH2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=16,
            textColor=colors.HexColor("#2f2a24"),
            spaceBefore=10,
            spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "ManualBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=13.2,
            textColor=colors.HexColor("#2f2a24"),
            spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "ManualBullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=12.8,
            leftIndent=0,
            textColor=colors.HexColor("#2f2a24"),
        ),
        "code": ParagraphStyle(
            "ManualCode",
            parent=base["Code"],
            fontName="Courier",
            fontSize=8.5,
            leading=11.5,
            textColor=colors.HexColor("#1f2933"),
            backColor=colors.HexColor("#f3f0ea"),
            borderColor=colors.HexColor("#d8d0c4"),
            borderWidth=0.4,
            borderPadding=6,
            spaceBefore=4,
            spaceAfter=8,
        ),
    }


def flush_paragraph(buffer: list[str], story: list, styles: dict[str, ParagraphStyle]):
    if not buffer:
        return
    text = " ".join(item.strip() for item in buffer if item.strip()).strip()
    if text:
        story.append(Paragraph(clean_inline(text), styles["body"]))
    buffer.clear()


def flush_bullets(buffer: list[str], story: list, styles: dict[str, ParagraphStyle]):
    if not buffer:
        return
    items = [
        ListItem(Paragraph(clean_inline(item), styles["bullet"]), leftIndent=12)
        for item in buffer
    ]
    story.append(
        ListFlowable(
            items,
            bulletType="bullet",
            start="circle",
            leftIndent=18,
            bulletFontName="Helvetica",
            bulletFontSize=6,
            spaceAfter=6,
        )
    )
    buffer.clear()


def footer(canvas, doc):
    canvas.saveState()
    width, _height = A4
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#827568"))
    canvas.drawString(1.6 * cm, 1.05 * cm, "Serv3 - Manual didatico")
    canvas.drawRightString(width - 1.6 * cm, 1.05 * cm, f"Pagina {doc.page}")
    canvas.restoreState()


def build_story(markdown: str):
    styles = build_styles()
    story = []
    paragraph_buffer: list[str] = []
    bullet_buffer: list[str] = []
    code_buffer: list[str] = []
    in_code = False

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()

        if line.strip().startswith("```"):
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            if in_code:
                code_text = "\n".join(code_buffer).strip("\n")
                if code_text:
                    story.append(Paragraph(clean_inline(code_text).replace("\n", "<br/>"), styles["code"]))
                code_buffer.clear()
                in_code = False
            else:
                in_code = True
            continue

        if in_code:
            code_buffer.append(line)
            continue

        stripped = line.strip()
        if not stripped:
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            continue

        if stripped.startswith("# "):
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            story.append(Paragraph(clean_inline(stripped[2:].strip()), styles["title"]))
            story.append(Spacer(1, 0.15 * cm))
            continue

        if stripped.startswith("## "):
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            if story:
                story.append(Spacer(1, 0.08 * cm))
            story.append(Paragraph(clean_inline(stripped[3:].strip()), styles["h1"]))
            continue

        if stripped.startswith("### "):
            flush_paragraph(paragraph_buffer, story, styles)
            flush_bullets(bullet_buffer, story, styles)
            story.append(Paragraph(clean_inline(stripped[4:].strip()), styles["h2"]))
            continue

        if stripped.startswith("- "):
            flush_paragraph(paragraph_buffer, story, styles)
            bullet_buffer.append(stripped[2:].strip())
            continue

        flush_bullets(bullet_buffer, story, styles)
        paragraph_buffer.append(stripped)

    flush_paragraph(paragraph_buffer, story, styles)
    flush_bullets(bullet_buffer, story, styles)

    first_page_break_index = None
    for index, flowable in enumerate(story):
        if isinstance(flowable, Paragraph) and getattr(flowable.style, "name", "") == "ManualH1":
            if first_page_break_index is None:
                first_page_break_index = index
                continue
            if index > 5 and len(story) > 80:
                story.insert(index, PageBreak())
                break

    return story


def main():
    markdown = SOURCE.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title="Manual Didatico do Sistema Serv3",
        author="Serv3",
    )
    story = build_story(markdown)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"generated {OUTPUT}")


if __name__ == "__main__":
    main()

