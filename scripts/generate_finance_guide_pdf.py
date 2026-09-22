from __future__ import annotations

"""
PDF do guia rápido do Painel Financeiro.

⚠️ POR QUE NÃO REUSEI `generate_training_guide_pdf.py`: o conversor dele trata só
escape + `código`. Ele NÃO trata **negrito**, tabela markdown nem citação (`>`) — e o
guia do financeiro é feito dessas três coisas: os avisos que mais importam estão em
citação, e a descrição das colunas é uma tabela. Rodando o conversor antigo, os
asteriscos sairiam impressos e a tabela viraria um parágrafo de pipes.

A paleta e as fontes são as mesmas dos outros dois PDFs (creme #F5F1EA, faixa
#211A14, ouro #B0884A), para a pasta `docs/` continuar parecendo um conjunto.

⚠️ AS FONTES PADRÃO DO REPORTLAB DESENHAM WINANSI, e não Unicode inteiro. Medido neste
documento: `→`, `−`, `⚠`, `️` e `📎` não existem no encoding e sairiam como
retângulos vazios ou nada. Em vez de embutir uma TTF (e destoar dos outros PDFs), cada
um tem substituto explícito em `SEGURO` — e o `⚠️` some do texto porque virou o próprio
desenho da caixa de aviso.

Uso: python scripts/generate_finance_guide_pdf.py
"""

from datetime import datetime
from pathlib import Path
import html
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
INPUT_MD = ROOT / 'docs' / 'guia-rapido-painel-financeiro.md'
OUTPUT_PDF = ROOT / 'docs' / 'Guia_Rapido_Painel_Financeiro.pdf'

PAGE_BG = colors.HexColor('#F5F1EA')
HEADER_BG = colors.HexColor('#211A14')
ACCENT = colors.HexColor('#B0884A')
TEXT = colors.HexColor('#1F2937')
SUBTLE = colors.HexColor('#5B6571')
RULE = colors.HexColor('#D8CFC2')
CALLOUT_BG = colors.HexColor('#EFE7D8')
WARN_BG = colors.HexColor('#F6E7D2')
WARN_BAR = colors.HexColor('#9A6B22')
TABLE_ZEBRA = colors.HexColor('#EDE6DA')

RODAPE = 'Serv3 - Guia rápido do Painel Financeiro'

# Ver o ⚠️ do topo do arquivo: fora do WinAnsi, um a um.
SEGURO = {
    '→': '–',  # →  seta (en dash: WinAnsi tem, e lê melhor que »)
    '−': '-',       # −  sinal de menos
    '\U0001F4CE': 'clipe',
    '⚠': '',        # ⚠  vira o desenho da caixa
    '️': '',        # seletor de emoji
}


def seguro(texto: str) -> str:
    for ruim, bom in SEGURO.items():
        texto = texto.replace(ruim, bom)
    return texto


def on_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)

    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, height - 16 * mm, width - doc.rightMargin, height - 16 * mm)

    canvas.setFillColor(SUBTLE)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(doc.leftMargin, 8 * mm, RODAPE)
    canvas.drawRightString(width - doc.rightMargin, 8 * mm, f'Página {doc.page}')
    canvas.restoreState()


def build_styles():
    base = getSampleStyleSheet()
    def st(nome, **kw):
        pai = kw.pop('parent', base['Normal'])
        return ParagraphStyle(nome, parent=pai, **kw)

    return {
        'cover_brand': st('cover_brand', fontName='Helvetica-Bold', fontSize=11, leading=14,
                          textColor=colors.HexColor('#D8C9B2')),
        'cover_title': st('cover_title', parent=base['Title'], fontName='Times-Bold', fontSize=22,
                          leading=26, textColor=colors.white, alignment=TA_LEFT, spaceAfter=8),
        'cover_subtitle': st('cover_subtitle', fontName='Helvetica', fontSize=10.5, leading=15.5,
                             textColor=colors.HexColor('#E8E0D3')),
        'h1': st('h1', parent=base['Heading1'], fontName='Times-Bold', fontSize=16.5, leading=21,
                 textColor=colors.HexColor('#121A24'), spaceBefore=6, spaceAfter=4, keepWithNext=1),
        'h2': st('h2', parent=base['Heading2'], fontName='Helvetica-Bold', fontSize=12, leading=15.5,
                 textColor=colors.HexColor('#223245'), spaceBefore=7, spaceAfter=3, keepWithNext=1),
        'body': st('body', fontName='Helvetica', fontSize=10.3, leading=14.2, textColor=TEXT, spaceAfter=3),
        'bullet': st('bullet', fontName='Helvetica', fontSize=10.1, leading=13.8, leftIndent=13,
                     bulletIndent=3, textColor=TEXT, spaceAfter=1.5),
        'numbered': st('numbered', fontName='Helvetica', fontSize=10.1, leading=13.8, leftIndent=16,
                       bulletIndent=3, bulletFontName='Helvetica-Bold', textColor=TEXT, spaceAfter=2.5),
        'note': st('note', fontName='Helvetica-Oblique', fontSize=9.2, leading=12, textColor=SUBTLE, spaceAfter=3),
        'callout': st('callout', fontName='Helvetica', fontSize=9.9, leading=13.4, textColor=colors.HexColor('#3A2F22')),
        'warn_label': st('warn_label', fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=WARN_BAR),
        'th': st('th', fontName='Helvetica-Bold', fontSize=9, leading=12, textColor=colors.HexColor('#EDE6DA')),
        'td': st('td', fontName='Helvetica', fontSize=9.4, leading=12.6, textColor=TEXT),
    }


def format_inline(raw: str) -> str:
    """Markdown de uma linha para as tags que o reportlab entende."""
    texto = html.escape(seguro(raw))
    # `código` antes de tudo: nada de negrito dentro de código.
    texto = re.sub(r'`([^`]+)`', r'<font name="Courier" size="9">\1</font>', texto)
    texto = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', texto)
    texto = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<i>\1</i>', texto)
    return texto


def caixa(paragrafos, largura, aviso: bool):
    """Citação do markdown vira caixa com barra à esquerda."""
    corpo = Table([[p] for p in paragrafos], colWidths=[largura - 6 * mm])
    corpo.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
    ]))
    externa = Table([[corpo]], colWidths=[largura])
    externa.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), WARN_BG if aviso else CALLOUT_BG),
        ('LINEBEFORE', (0, 0), (0, -1), 2.2, WARN_BAR if aviso else ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return externa


def celulas_da_linha(linha: str):
    return [c.strip() for c in linha.strip().strip('|').split('|')]


def tabela(linhas, largura, styles):
    cabecalho, *corpo = linhas
    cols = celulas_da_linha(cabecalho)
    dados = [[Paragraph(format_inline(c), styles['th']) for c in cols]]
    for linha in corpo:
        dados.append([Paragraph(format_inline(c), styles['td']) for c in celulas_da_linha(linha)])

    # Primeira coluna mais estreita: nas duas tabelas do guia ela é o rótulo.
    n = len(cols)
    if n == 2:
        larguras = [largura * 0.30, largura * 0.70]
    else:
        larguras = [largura / n] * n

    t = Table(dados, colWidths=larguras, repeatRows=1)
    estilo = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('LINEBELOW', (0, 0), (-1, 0), 0.8, ACCENT),
        ('GRID', (0, 1), (-1, -1), 0.3, RULE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
    ]
    for i in range(2, len(dados), 2):
        estilo.append(('BACKGROUND', (0, i), (-1, i), TABLE_ZEBRA))
    t.setStyle(TableStyle(estilo))
    return t


def capa(largura, styles):
    # ⚠️ UMA COLUNA, TRÊS LINHAS. Com as três numa linha só e um `colWidths` de um
    # elemento, o reportlab não reclama — ele desenha para fora da margem direita, e o
    # subtítulo sai cortado na borda da folha.
    linhas = [
        [Paragraph('SERV3 &middot; GRUPO CHRISTUS', styles['cover_brand'])],
        [Paragraph('Painel Financeiro', styles['cover_title'])],
        [Paragraph(
            'Guia rápido: registrar o orçado e o realizado de cada OS.<br/>'
            f'Para Gestor e Admin &middot; {datetime.now().strftime("%d/%m/%Y")}',
            styles['cover_subtitle'],
        )],
    ]
    t = Table(linhas, colWidths=[largura])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), HEADER_BG),
        ('INNERGRID', (0, 0), (-1, -1), 0, HEADER_BG),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#3A3026')),
        ('LEFTPADDING', (0, 0), (-1, -1), 16), ('RIGHTPADDING', (0, 0), (-1, -1), 16),
        ('TOPPADDING', (0, 0), (-1, -1), 11), ('BOTTOMPADDING', (0, 0), (-1, -1), 11),
    ]))
    return t


def comeca_bloco(texto: str) -> bool:
    """A linha abre uma construção nova, em vez de continuar a anterior?"""
    return (
        not texto
        or texto.startswith(('#', '>', '|', '- ', '**Proposta', '**Materiais', '**Valor'))
        or (set(texto) == {'-'} and len(texto) >= 3)
        or bool(re.match(r'^\d+\.\s', texto))
    )


def amarra_titulos(story):
    """
    Título não pode ser a última coisa da página.

    ⚠️ `keepWithNext=1` NO ESTILO NÃO BASTOU — medido: o "8) Três regras" ficou sozinho
    no pé da página 3 mesmo com a propriedade ligada. Então a amarração é explícita:
    cada título vira um `KeepTogether` com o primeiro flowable de conteúdo depois dele,
    pulando os espaçadores. De quebra, a página seguinte deixa de começar com dez
    linhas soltas num papel quase branco.
    """
    saida = []
    i = 0
    while i < len(story):
        item = story[i]
        titulo = isinstance(item, Paragraph) and getattr(item.style, 'name', '') in ('h1', 'h2')
        if not titulo:
            saida.append(item); i += 1
            continue
        grupo = [item]
        j = i + 1
        while j < len(story) and isinstance(story[j], Spacer):
            grupo.append(story[j]); j += 1
        if j < len(story):
            grupo.append(story[j]); j += 1
        # ⚠️ E A TABELA VAI JUNTO. Medido: "3. Ler a diferença" e a frase "Um exemplo:"
        # ficaram no pé de uma página e a tabela do exemplo abriu a seguinte — o pior
        # lugar possível para cortar, porque o exemplo é a explicação.
        k = j
        while k < len(story) and isinstance(story[k], Spacer):
            k += 1
        if k < len(story) and isinstance(story[k], Table):
            grupo.extend(story[j:k + 1]); j = k + 1
        saida.append(KeepTogether(grupo))
        i = j
    return saida


def parse(linhas, largura, styles):
    story = [capa(largura, styles), Spacer(1, 5 * mm)]

    def junta(i: int) -> tuple[str, int]:
        """
        ⚠️ O MARKDOWN TEM QUEBRA DE LINHA DURA EM ~88 COLUNAS, e emitir cada linha da
        fonte como um parágrafo próprio produzia texto picado: frase cortada no meio,
        espaçamento entre pedaços da mesma ideia, e `*itálico*` que atravessa duas
        linhas saindo com os asteriscos impressos, porque o regex é por linha.
        Aqui as continuações voltam a ser um parágrafo só.
        """
        pedacos = [linhas[i].strip()]
        i += 1
        while i < len(linhas) and not comeca_bloco(linhas[i].strip()):
            pedacos.append(linhas[i].strip())
            i += 1
        return ' '.join(pedacos), i

    i = 0
    while i < len(linhas):
        bruta = linhas[i].rstrip('\n')
        texto = bruta.strip()
        i += 1

        if not texto:
            story.append(Spacer(1, 2.2 * mm))
            continue

        if texto.startswith('# '):          # o título já está na capa
            continue

        if set(texto) == {'-'} and len(texto) >= 3:
            story.append(Spacer(1, 1.5 * mm))
            story.append(HRFlowable(width='100%', thickness=0.5, color=RULE, spaceAfter=3))
            continue

        if texto.startswith('## '):
            story.append(Paragraph(format_inline(texto[3:]), styles['h1']))
            continue

        if texto.startswith('### '):
            story.append(Paragraph(format_inline(texto[4:]), styles['h2']))
            continue

        # ── citação: junta as linhas seguidas e vira caixa ──
        if texto.startswith('>'):
            cru = []
            atual = [texto.lstrip('>').strip()]
            while i < len(linhas) and linhas[i].strip().startswith('>'):
                pedaco = linhas[i].strip().lstrip('>').strip()
                i += 1
                if not pedaco:
                    cru.append(' '.join(atual)); atual = []
                    continue
                if pedaco.startswith('- ') or pedaco.startswith('**'):
                    if atual: cru.append(' '.join(atual))
                    atual = [pedaco]
                else:
                    atual.append(pedaco)
            if atual:
                cru.append(' '.join(atual))
            aviso = any('⚠' in p for p in cru)
            paragrafos = []
            if aviso:
                paragrafos.append(Paragraph('ATENÇÃO', styles['warn_label']))
            for p in cru:
                if not p.strip():
                    continue
                if p.startswith('- '):
                    paragrafos.append(Paragraph(format_inline(p[2:]), styles['callout'], bulletText='•'))
                else:
                    paragrafos.append(Paragraph(format_inline(p), styles['callout']))
            story.append(caixa(paragrafos, largura, aviso))
            story.append(Spacer(1, 2.5 * mm))
            continue

        # ── tabela: cabeçalho, separador, corpo ──
        if texto.startswith('|') and i < len(linhas) and set(linhas[i].strip()) <= set('|-: '):
            i += 1  # pula o separador
            corpo = []
            while i < len(linhas) and linhas[i].strip().startswith('|'):
                corpo.append(linhas[i].strip()); i += 1
            story.append(Spacer(1, 1 * mm))
            story.append(tabela([texto, *corpo], largura, styles))
            story.append(Spacer(1, 3 * mm))
            continue

        if texto.startswith('- '):
            corpo, i = junta(i - 1)
            story.append(Paragraph(format_inline(corpo[2:]), styles['bullet'], bulletText='•'))
            continue

        if re.match(r'^\d+\.\s', texto):
            corpo, i = junta(i - 1)
            numerada = re.match(r'^(\d+)\.\s+(.+)$', corpo)
            story.append(Paragraph(format_inline(numerada.group(2)), styles['numbered'],
                                   bulletText=f'{numerada.group(1)}.'))
            continue

        # A capa já estampa a data; repetir aqui é ruído.
        if texto.lower().startswith('atualizado em'):
            continue
        corpo, i = junta(i - 1)
        story.append(Paragraph(format_inline(corpo), styles['body']))

    return story


def main():
    if not INPUT_MD.exists():
        raise FileNotFoundError(f'Arquivo não encontrado: {INPUT_MD}')

    margem = 20 * mm
    largura = A4[0] - 2 * margem
    styles = build_styles()
    story = amarra_titulos(parse(INPUT_MD.read_text(encoding='utf-8').splitlines(), largura, styles))

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF), pagesize=A4,
        leftMargin=margem, rightMargin=margem, topMargin=22 * mm, bottomMargin=15 * mm,
        title='Guia rápido - Painel Financeiro - Serv3',
        author='Serv3',
        subject='Como registrar o orçado e o realizado de cada OS',
    )
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f'PDF gerado: {OUTPUT_PDF}')


if __name__ == '__main__':
    main()
