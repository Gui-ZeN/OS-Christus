from __future__ import annotations

from datetime import datetime
from pathlib import Path
import html
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
INPUT_MD = ROOT / 'docs' / 'guia-treinamento-operacional-os-christus.md'
OUTPUT_PDF = ROOT / 'docs' / 'Guia_Treinamento_OS_Christus.pdf'

PAGE_BG = colors.HexColor('#F5F1EA')
HEADER_BG = colors.HexColor('#211A14')
ACCENT = colors.HexColor('#B0884A')
TEXT = colors.HexColor('#1F2937')
SUBTLE = colors.HexColor('#5B6571')


def on_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)

    canvas.setStrokeColor(colors.HexColor('#D8CFC2'))
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, height - 16 * mm, width - doc.rightMargin, height - 16 * mm)

    canvas.setFillColor(SUBTLE)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(doc.leftMargin, 8 * mm, 'OS Christus · Guia de Treinamento')
    canvas.drawRightString(width - doc.rightMargin, 8 * mm, f'Página {doc.page}')
    canvas.restoreState()


def build_styles():
    base = getSampleStyleSheet()
    styles = {
        'cover_brand': ParagraphStyle(
            'cover_brand',
            parent=base['Normal'],
            fontName='Helvetica-Bold',
            fontSize=11,
            textColor=colors.HexColor('#D8C9B2'),
            leading=14,
            tracking=0.5,
        ),
        'cover_title': ParagraphStyle(
            'cover_title',
            parent=base['Title'],
            fontName='Times-Bold',
            fontSize=28,
            leading=33,
            textColor=colors.white,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        'cover_subtitle': ParagraphStyle(
            'cover_subtitle',
            parent=base['Normal'],
            fontName='Helvetica',
            fontSize=11,
            leading=16,
            textColor=colors.HexColor('#E8E0D3'),
        ),
        'h1': ParagraphStyle(
            'h1',
            parent=base['Heading1'],
            fontName='Times-Bold',
            fontSize=17,
            leading=22,
            textColor=colors.HexColor('#121A24'),
            spaceBefore=9,
            spaceAfter=5,
        ),
        'h2': ParagraphStyle(
            'h2',
            parent=base['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=12.5,
            leading=16,
            textColor=colors.HexColor('#223245'),
            spaceBefore=7,
            spaceAfter=3,
        ),
        'body': ParagraphStyle(
            'body',
            parent=base['Normal'],
            fontName='Helvetica',
            fontSize=10.3,
            leading=14,
            textColor=TEXT,
            spaceAfter=2,
        ),
        'bullet': ParagraphStyle(
            'bullet',
            parent=base['Normal'],
            fontName='Helvetica',
            fontSize=10.1,
            leading=13.5,
            leftIndent=12,
            bulletIndent=2,
            textColor=TEXT,
            spaceAfter=1,
        ),
        'numbered': ParagraphStyle(
            'numbered',
            parent=base['Normal'],
            fontName='Helvetica',
            fontSize=10.1,
            leading=13.5,
            leftIndent=12,
            textColor=TEXT,
            spaceAfter=1,
        ),
        'note': ParagraphStyle(
            'note',
            parent=base['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=9.2,
            leading=12,
            textColor=SUBTLE,
            spaceAfter=3,
        ),
    }
    return styles


def parse_markdown_to_story(lines, styles):
    story = []

    def format_inline(raw: str) -> str:
        escaped = html.escape(raw)
        return re.sub(r'`([^`]+)`', r'<font name="Courier">\1</font>', escaped)

    # cover
    cover_data = [[
        Paragraph('OS CHRISTUS', styles['cover_brand']),
        Paragraph('Guia de Treinamento Operacional', styles['cover_title']),
        Paragraph(
            f'Fluxo completo da OS, e-mails por etapa, assuntos padrão e operação por perfil.<br/>Gerado em {datetime.now().strftime("%d/%m/%Y %H:%M")}.',
            styles['cover_subtitle'],
        ),
    ]]

    cover = Table(cover_data, colWidths=[170 * mm])
    cover.setStyle(
        TableStyle(
            [
                ('BACKGROUND', (0, 0), (-1, -1), HEADER_BG),
                ('INNERGRID', (0, 0), (-1, -1), 0, HEADER_BG),
                ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#3A3026')),
                ('LEFTPADDING', (0, 0), (-1, -1), 16),
                ('RIGHTPADDING', (0, 0), (-1, -1), 16),
                ('TOPPADDING', (0, 0), (-1, -1), 16),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 16),
            ]
        )
    )
    story.append(cover)
    story.append(Spacer(1, 9 * mm))

    for raw in lines:
        line = raw.rstrip('\n')
        stripped = line.strip()

        if not stripped:
            story.append(Spacer(1, 2.3 * mm))
            continue

        if stripped.startswith('# '):
            continue

        if stripped.startswith('## '):
            text = format_inline(stripped[3:].strip())
            story.append(Paragraph(text, styles['h1']))
            continue

        if stripped.startswith('### '):
            text = format_inline(stripped[4:].strip())
            story.append(Paragraph(text, styles['h2']))
            continue

        if stripped.startswith('- '):
            text = format_inline(stripped[2:].strip())
            story.append(Paragraph(text, styles['bullet'], bulletText='•'))
            continue

        numbered = re.match(r'^(\d+)\.\s+(.+)$', stripped)
        if numbered:
            idx, text_raw = numbered.group(1), numbered.group(2)
            text = format_inline(text_raw)
            story.append(Paragraph(f'<b>{idx}.</b> {text}', styles['numbered']))
            continue

        text = format_inline(stripped)

        if stripped.lower().startswith('observação') or stripped.lower().startswith('atualizado em'):
            story.append(Paragraph(text, styles['note']))
        else:
            story.append(Paragraph(text, styles['body']))

    return story


def main():
    if not INPUT_MD.exists():
        raise FileNotFoundError(f'Arquivo não encontrado: {INPUT_MD}')

    styles = build_styles()
    lines = INPUT_MD.read_text(encoding='utf-8').splitlines()
    story = parse_markdown_to_story(lines, styles)

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=22 * mm,
        bottomMargin=15 * mm,
        title='Guia de Treinamento Operacional - OS Christus',
        author='OS Christus',
        subject='Manual operacional e fluxo de e-mails',
    )

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f'PDF gerado: {OUTPUT_PDF}')


if __name__ == '__main__':
    main()
