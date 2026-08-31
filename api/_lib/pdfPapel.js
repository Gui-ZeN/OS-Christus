/**
 * O PAPEL — medidas e tinta comuns aos PDFs do Serv3.
 *
 * Saiu de `reportPdf.js` quando nasceu o segundo documento (`ticketPdf.js`). São
 * dois papéis diferentes — um relatório gerencial e o retrato de uma OS — mas eles
 * saem da mesma casa e chegam juntos na mesa de quem lê. Palette e margem duplicadas
 * divergem no dia em que alguém acerta o dourado de um só, e aí o sistema passa a
 * ter duas identidades sem ninguém ter decidido isso.
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
 * geometria como parâmetro opcional; sem ela, usam A4 retrato e os dois documentos
 * antigos desenham igual. Trocar as constantes de módulo por paisagem teria mudado o
 * relatório gerencial e o retrato da OS em silêncio.
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
export function drawTable(doc, x, y, w, cols, rows, vazio = 'Sem dados no período/filtro.', geo = A4_RETRATO) {
  const colW = cols.map(c => (c.w != null ? c.w : (w - cols.reduce((s, cc) => s + (cc.w || 0), 0)) / cols.filter(cc => cc.w == null).length));
  const drawHead = yy => {
    doc.font('Helvetica-Bold').fontSize(8);
    let cx = x;
    cols.forEach((c, i) => {
      doc.fillColor(C.goldDeep).text(c.label.toUpperCase(), cx + 6, yy, { width: colW[i] - 12, align: c.align || 'left', lineBreak: false, characterSpacing: 0.3 });
      cx += colW[i];
    });
    yy += 13;
    doc.moveTo(x, yy).lineTo(x + w, yy).lineWidth(1.2).strokeColor(C.goldDeep).stroke();
    return yy + 2;
  };
  y = drawHead(y);
  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.sub).text(vazio, x + 6, y + 4);
    return y + 18;
  }
  const rowH = 15;
  rows.forEach((row, ri) => {
    if (y + rowH > geo.BOTTOM) {
      doc.addPage();
      y = drawHead(geo.M);
    }
    if (ri % 2) doc.rect(x, y, w, rowH).fill(C.soft);
    let cx = x;
    cols.forEach((c, i) => {
      const isFirst = i === 0;
      doc.font(isFirst ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(isFirst ? C.ink : C.body)
        .text(String(row[i]), cx + 6, y + 3.5, { width: colW[i] - 12, align: c.align || 'left', lineBreak: false });
      cx += colW[i];
    });
    y += rowH;
    doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.5).strokeColor(C.line).stroke();
  });
  return y;
}
