/**
 * O PAPEL — medidas e tinta comuns aos PDFs do Serv3.
 *
 * Saiu de `reportPdf.js` quando nasceu o segundo documento da casa. São papéis
 * diferentes — hoje o relatório gerencial e a fila da Gestão — mas saem do mesmo
 * lugar e chegam juntos na mesa de quem lê. Palette e margem duplicadas divergem no
 * dia em que alguém acerta o dourado de um só, e aí o sistema passa a ter duas
 * identidades sem ninguém ter decidido isso.
 *
 * Só constantes: cada documento desenha o que é dele.
 */

export const M = 48; // margem
export const PAGE_W = 595.28; // A4
export const PAGE_H = 841.89;
export const CW = PAGE_W - M * 2; // largura de conteúdo
export const BOTTOM = PAGE_H - M - 24; // limite antes do rodapé

/**
 * A GEOMETRIA DA PÁGINA, QUANDO ELA NÃO É A4 RETRATO.
 *
 * Nasceu com o terceiro documento: a lista da Gestão como está na tela. Oito colunas
 * não cabem em 499pt de retrato sem picar o assunto, que é justamente o que
 * identifica a OS na fila — e uma lista impressa com assunto cortado não serve para
 * a reunião de sede, que é para onde ela vai.
 *
 * ⚠️ O PADRÃO É EXATAMENTE O QUE ERA. `ensureSpace` e `drawTable` recebem a
 * geometria como parâmetro opcional; sem ela, usam A4 retrato e o relatório
 * gerencial, que já estava em produção, desenha igual. Trocar as constantes de
 * módulo por paisagem o teria mudado em silêncio.
 */
export const A4_RETRATO = { M, PAGE_W, PAGE_H, CW, BOTTOM };

export const A4_PAISAGEM = {
  M,
  PAGE_W: PAGE_H,
  PAGE_H: PAGE_W,
  CW: PAGE_H - M * 2,
  BOTTOM: PAGE_W - M - 24,
};

export const C = {
  ink: '#241f1b',
  body: '#4a4038',
  sub: '#8a7f74',
  gold: '#a67c3d',
  goldDeep: '#7d5c28',
  green: '#4a7a5c',
  line: '#e5ddd0',
  soft: '#faf7f2',
};

/**
 * A PENA — as primitivas de desenho que os dois documentos usam.
 *
 * Vieram inteiras de `reportPdf.js`, sem mudanca de comportamento: o corte de pagina,
 * o cabecalho de secao e a tabela zebrada sao o que da aos dois PDFs a mesma cara.
 */
export function ensureSpace(doc, y, needed, geo = A4_RETRATO) {
  if (y + needed <= geo.BOTTOM) return y;
  doc.addPage();
  return geo.M;
}

export function sectionHeader(doc, y, title) {
  y = ensureSpace(doc, y, 60);
  doc.rect(M, y + 3, 16, 2.5).fill(C.gold);
  doc.font('Times-Bold').fontSize(13).fillColor(C.ink).text(title, M + 24, y - 1, { lineBreak: false });
  y += 16;
  doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(C.line).stroke();
  return y + 12;
}

/**
 * `vazio` é parâmetro porque a frase da tabela sem linhas é do DOCUMENTO, não da
 * tabela: no relatório gerencial o vazio vem de um filtro, e no retrato de uma OS
 * vem de o registro não existir. A mesma frase nos dois lugares diria ao leitor da
 * OS que ele filtrou alguma coisa.
 */
/**
 * ⚠️ A ALTURA DA LINHA É MEDIDA, NÃO PRESUMIDA (04/09/2026).
 *
 * A tabela tinha `rowH = 15` fixo e passava `lineBreak: false` em cada célula,
 * confiando que nada quebraria linha. **O pdfkit 0.19.1 ignora esse `lineBreak`
 * quando há `width`**: medido, `heightOfString` devolve exatamente o mesmo valor com
 * ele ligado ou desligado (20,8pt onde uma linha mede 8,3). A garantia estava escrita
 * e nunca valeu.
 *
 * O efeito no papel: assunto de 115 caracteres — há vários em produção — quebrava em
 * duas linhas dentro de uma faixa de 15pt, e a segunda linha era desenhada por cima
 * da OS seguinte. A lista da Gestão vai para reunião de sede impressa; linha comida é
 * OS que ninguém lê.
 *
 * Agora cada linha (e o cabeçalho) mede a célula mais alta e cresce até ela. Cortar
 * com reticências seria a outra saída e foi recusada pelo mesmo motivo que a tela dá
 * para não truncar: o assunto é o que identifica a OS na fila.
 */
export function drawTable(doc, x, y, w, cols, rows, vazio = 'Sem dados no período/filtro.', geo = A4_RETRATO) {
  const colW = cols.map(c => (c.w != null ? c.w : (w - cols.reduce((s, cc) => s + (cc.w || 0), 0)) / cols.filter(cc => cc.w == null).length));
  const RESPIRO_X = 6;
  const RESPIRO_Y = 3.5;
  const larguraUtil = i => colW[i] - RESPIRO_X * 2;

  /**
   * Quantas linhas a faixa precisa — não a altura crua.
   *
   * ⚠️ A ALTURA DE UMA LINHA CONTINUA SENDO A DE ANTES. Somar `heightOfString` ao
   * respiro engordaria toda linha em ~3pt (a medida já traz entrelinha), e o
   * relatório gerencial, que só tem células de uma linha, mudaria de desenho sem
   * ninguém ter pedido. Contando LINHAS, o caso de uma linha cai exatamente na
   * altura antiga e só o que quebra cresce.
   */
  const linhasDaFaixa = (celulas, aplicarFonte) =>
    celulas.reduce((maior, texto, i) => {
      aplicarFonte(i);
      const umaLinha = doc.currentLineHeight();
      const h = doc.heightOfString(String(texto ?? ''), { width: larguraUtil(i) });
      return Math.max(maior, Math.max(1, Math.round(h / umaLinha)));
    }, 1);

  const fonteDoCabecalho = () => doc.font('Helvetica-Bold').fontSize(8);
  fonteDoCabecalho();
  const alturaDoCabecalho = 13 + (linhasDaFaixa(cols.map(c => c.label.toUpperCase()), fonteDoCabecalho) - 1) * doc.currentLineHeight();

  const drawHead = yy => {
    let cx = x;
    cols.forEach((c, i) => {
      fonteDoCabecalho();
      doc.fillColor(C.goldDeep).text(c.label.toUpperCase(), cx + RESPIRO_X, yy, { width: larguraUtil(i), align: c.align || 'left', characterSpacing: 0.3 });
      cx += colW[i];
    });
    yy += alturaDoCabecalho;
    doc.moveTo(x, yy).lineTo(x + w, yy).lineWidth(1.2).strokeColor(C.goldDeep).stroke();
    return yy + 2;
  };
  y = drawHead(y);
  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.sub).text(vazio, x + RESPIRO_X, y + 4);
    return y + 18;
  }
  const fonteDaCelula = i => doc.font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
  rows.forEach((row, ri) => {
    // 15pt para uma linha — a medida antiga, intacta — mais uma entrelinha por linha
    // extra. Tabela de números desenha exatamente como desenhava.
    fonteDaCelula(1);
    const rowH = 15 + (linhasDaFaixa(row, fonteDaCelula) - 1) * doc.currentLineHeight();
    if (y + rowH > geo.BOTTOM) {
      doc.addPage();
      y = drawHead(geo.M);
    }
    if (ri % 2) doc.rect(x, y, w, rowH).fill(C.soft);
    let cx = x;
    cols.forEach((c, i) => {
      fonteDaCelula(i);
      doc.fillColor(i === 0 ? C.ink : C.body)
        .text(String(row[i] ?? ''), cx + RESPIRO_X, y + RESPIRO_Y, { width: larguraUtil(i), align: c.align || 'left' });
      cx += colW[i];
    });
    y += rowH;
    doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.5).strokeColor(C.line).stroke();
  });
  return y;
}
