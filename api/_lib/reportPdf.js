import PDFDocument from 'pdfkit';

/**
 * Gera o Relatório Gerencial de OS em PDF no servidor (pdfkit, sem browser) —
 * layout executivo/editorial pra diretoria. Recebe o mesmo `data` que o front já
 * computa (ver KpiView) e devolve um Buffer. Testável localmente (Node).
 */

const M = 48; // margem
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const CW = PAGE_W - M * 2; // largura de conteúdo
const BOTTOM = PAGE_H - M - 24; // limite antes do rodapé

const C = {
  ink: '#241f1b',
  body: '#4a4038',
  sub: '#8a7f74',
  gold: '#a67c3d',
  goldDeep: '#7d5c28',
  green: '#4a7a5c',
  line: '#e5ddd0',
  soft: '#faf7f2',
};

function niceCeil(v) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function ensureSpace(doc, y, needed) {
  if (y + needed <= BOTTOM) return y;
  doc.addPage();
  return M;
}

function sectionHeader(doc, y, title) {
  y = ensureSpace(doc, y, 60);
  doc.rect(M, y + 3, 16, 2.5).fill(C.gold);
  doc.font('Times-Bold').fontSize(13).fillColor(C.ink).text(title, M + 24, y - 1, { lineBreak: false });
  y += 16;
  doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(C.line).stroke();
  return y + 12;
}

function drawTable(doc, x, y, w, cols, rows) {
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
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.sub).text('Sem dados no período/filtro.', x + 6, y + 4);
    return y + 18;
  }
  const rowH = 15;
  rows.forEach((row, ri) => {
    if (y + rowH > BOTTOM) {
      doc.addPage();
      y = drawHead(M);
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

function drawBarChart(doc, x, y, w, h, categories, series, legend) {
  const axisPad = 24;
  const rotate = categories.length > 6 || categories.some(c => String(c).length > 4);
  const botPad = rotate ? 34 : 16;
  const plotX = x + axisPad;
  const plotW = w - axisPad;
  const plotH = h - botPad;
  const maxV = niceCeil(Math.max(1, ...series.flatMap(s => s.values)));
  const steps = 4;

  // grades + eixo Y
  for (let i = 0; i <= steps; i++) {
    const gy = y + plotH - (plotH * i) / steps;
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).dash(1, { space: 2 }).strokeColor(C.line).stroke();
    doc.undash();
    doc.font('Helvetica').fontSize(7).fillColor(C.sub)
      .text(String(Math.round((maxV * i) / steps)), x, gy - 3.5, { width: axisPad - 4, align: 'right', lineBreak: false });
  }

  // barras
  const groupW = plotW / categories.length;
  const n = series.length;
  const gap = 3;
  const barW = Math.max(4, Math.min(26, (groupW * 0.62 - gap * (n - 1)) / n));
  categories.forEach((cat, ci) => {
    const gcx = plotX + groupW * ci + groupW / 2;
    const totalW = barW * n + gap * (n - 1);
    let bx = gcx - totalW / 2;
    series.forEach(s => {
      const val = s.values[ci] || 0;
      const bh = (val / maxV) * plotH;
      const by = y + plotH - bh;
      if (bh > 0) doc.rect(bx, by, barW, bh).fill(s.color);
      if (val > 0) doc.font('Helvetica-Bold').fontSize(6.5).fillColor(C.sub)
        .text(String(val), bx - 5, by - 8.5, { width: barW + 10, align: 'center', lineBreak: false });
      bx += barW + gap;
    });
    doc.font('Helvetica').fontSize(7).fillColor(C.body);
    if (rotate) {
      doc.save().rotate(-24, { origin: [gcx, y + plotH + 5] })
        .text(String(cat), gcx - 42, y + plotH + 2, { width: 42, align: 'right', lineBreak: false }).restore();
    } else {
      doc.text(String(cat), gcx - groupW / 2, y + plotH + 5, { width: groupW, align: 'center', lineBreak: false });
    }
  });

  let usedH = h;
  if (legend && n > 1) {
    let lx = plotX;
    const ly = y + h + 4;
    series.forEach(s => {
      doc.rect(lx, ly, 8, 8).fill(s.color);
      doc.font('Helvetica').fontSize(8).fillColor(C.body).text(s.label, lx + 11, ly, { lineBreak: false });
      lx += 11 + doc.widthOfString(s.label) + 18;
    });
    usedH += 16;
  }
  return usedH;
}

function drawFooter(doc, data, page, total) {
  const fy = PAGE_H - M - 6;
  doc.moveTo(M, fy - 6).lineTo(M + CW, fy - 6).lineWidth(1.5).strokeColor(C.gold).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.body).text('Grupo Christus · Serv3 — Gestão de Manutenção', M, fy, { lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(C.sub)
    .text(`Confidencial · sem dados financeiros · pág. ${page}/${total}`, M, fy, { width: CW, align: 'right', lineBreak: false });
}

export async function buildReportPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: 0, left: M, right: M }, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = M;

    // ── Masthead ──────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.gold)
      .text('GRUPO CHRISTUS · MANUTENÇÃO', M, y, { characterSpacing: 1.6, lineBreak: false });
    // Confidencial (direita)
    const tagW = 74;
    doc.rect(M + CW - tagW, y - 2, tagW, 14).lineWidth(1).strokeColor(C.gold).stroke();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.goldDeep)
      .text('CONFIDENCIAL', M + CW - tagW, y + 1.5, { width: tagW, align: 'center', characterSpacing: 1, lineBreak: false });
    y += 13;
    doc.font('Times-Bold').fontSize(21).fillColor(C.ink)
      .text('Relatório Gerencial de Ordens de Serviço', M, y, { lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).fillColor(C.sub)
      .text(`Gerado em ${data.geradoEm}`, M + CW - 160, y + 6, { width: 160, align: 'right', lineBreak: false });
    y += 28;
    doc.rect(M, y, CW, 2.5).fill(C.gold);
    y += 12;

    // recorte
    doc.font('Helvetica').fontSize(9.5);
    const recorte = [['Período', data.periodoLabel], ['Sede', data.sedeLabel], ['Região', data.regiaoLabel]];
    let rx = M;
    recorte.forEach(([k, v], i) => {
      if (i > 0) { doc.fillColor(C.line).text('  |  ', rx, y, { lineBreak: false }); rx += doc.widthOfString('  |  '); }
      doc.font('Helvetica').fillColor(C.sub).text(`${k}: `, rx, y, { lineBreak: false }); rx += doc.widthOfString(`${k}: `);
      doc.font('Helvetica-Bold').fillColor(C.ink).text(String(v), rx, y, { lineBreak: false }); rx += doc.widthOfString(String(v));
    });
    y += 20;

    // ── Leitura rápida ────────────────────────────────────────
    const highlights = [
      `${data.totalOs} OS no período`,
      `${data.abertas} em aberto`,
      `${data.urgentesAbertas} urgentes/altas`,
      data.osMaisAntigaDias != null ? `mais antiga há ${data.osMaisAntigaDias} dias` : null,
    ].filter(Boolean).join('  ·  ');
    const lrH = 26;
    doc.rect(M, y, CW, lrH).fill(C.soft);
    doc.rect(M, y, 3, lrH).fill(C.gold);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.goldDeep).text('LEITURA RÁPIDA', M + 12, y + 5, { lineBreak: false });
    doc.font('Times-Italic').fontSize(10.5).fillColor(C.body).text(highlights + '.', M + 12, y + 14, { width: CW - 24, lineBreak: false });
    y += lrH + 16;

    // ── Banda de KPIs ─────────────────────────────────────────
    const stats = [
      { label: 'Total de OS', value: data.totalOs },
      { label: 'Em aberto', value: data.abertas },
      { label: 'Encerradas', value: data.encerradas },
      { label: 'Urgentes / Altas', value: data.urgentesAbertas, hint: 'em aberto' },
      { label: 'OS mais antiga', value: data.osMaisAntigaDias == null ? '—' : `${data.osMaisAntigaDias}d`, hint: data.osMaisAntigaDias == null ? '' : 'em aberto' },
    ];
    const bandH = 52;
    doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(C.line).stroke();
    const sw = CW / stats.length;
    stats.forEach((s, i) => {
      const sx = M + sw * i;
      if (i > 0) doc.moveTo(sx, y + 6).lineTo(sx, y + bandH - 6).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.sub).text(s.label.toUpperCase(), sx + 12, y + 9, { width: sw - 16, characterSpacing: 0.4, lineBreak: false });
      doc.font('Times-Bold').fontSize(23).fillColor(C.ink).text(String(s.value), sx + 12, y + 20, { width: sw - 16, lineBreak: false });
      if (s.hint) doc.font('Helvetica').fontSize(7.5).fillColor(C.sub).text(s.hint, sx + 12, y + 44, { width: sw - 16, lineBreak: false });
    });
    y += bandH;
    doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(C.line).stroke();
    y += 8;

    // ── OS por Sede ───────────────────────────────────────────
    y = ensureSpace(doc, y, 166 + data.osPorSede.length * 15 + 60);
    y = sectionHeader(doc, y, 'OS por Sede');
    y += drawBarChart(doc, M, y, CW, 150,
      data.osPorSede.map(s => s.name),
      [{ label: 'Abertas', color: C.gold, values: data.osPorSede.map(s => s.abertas) },
       { label: 'Encerradas', color: C.green, values: data.osPorSede.map(s => s.fechadas) }],
      true);
    y += 8;
    y = drawTable(doc, M, y, CW,
      [{ label: 'Sede' }, { label: 'Abertas', align: 'right', w: 90 }, { label: 'Encerradas', align: 'right', w: 90 }, { label: 'Total', align: 'right', w: 70 }],
      data.osPorSede.map(s => [s.name, s.abertas, s.fechadas, s.abertas + s.fechadas]));
    y += 8;

    // ── Backlog por Etapa ─────────────────────────────────────
    y = ensureSpace(doc, y, 140 + data.backlogPorEtapa.length * 15 + 60);
    y = sectionHeader(doc, y, 'Backlog por Etapa (OS na fila)');
    y += drawBarChart(doc, M, y, CW, 140,
      data.backlogPorEtapa.map(e => e.name),
      [{ label: 'OS', color: C.gold, values: data.backlogPorEtapa.map(e => e.total) }], false);
    y += 8;
    y = drawTable(doc, M, y, CW,
      [{ label: 'Etapa' }, { label: 'OS na fila', align: 'right', w: 120 }],
      data.backlogPorEtapa.map(e => [e.name, e.total]));
    y += 8;

    // ── Tendência mensal ──────────────────────────────────────
    y = ensureSpace(doc, y, 210);
    y = sectionHeader(doc, y, 'Tendência Mensal (abertas × encerradas)');
    y += drawBarChart(doc, M, y, CW, 140,
      data.tendenciaMensal.map(t => t.name),
      [{ label: 'Abertas', color: C.gold, values: data.tendenciaMensal.map(t => t.abertas) },
       { label: 'Encerradas', color: C.green, values: data.tendenciaMensal.map(t => t.encerradas) }],
      true);
    y += 12;

    // ── Tabelas pareadas ──────────────────────────────────────
    const gap = 20;
    const halfW = (CW - gap) / 2;
    y = ensureSpace(doc, y, 140);
    let y1 = sectionHeader2(doc, M, y, halfW, 'Idade do backlog');
    let y2 = sectionHeader2(doc, M + halfW + gap, y, halfW, 'Tempo médio por etapa');
    const yA = drawTable(doc, M, y1, halfW, [{ label: 'Faixa' }, { label: 'OS abertas', align: 'right', w: 80 }], data.agingBuckets.map(a => [a.name, a.total]));
    const yB = drawTable(doc, M + halfW + gap, y2, halfW, [{ label: 'Etapa' }, { label: 'Dias méd.', align: 'right', w: 70 }], data.tempoPorEtapa.map(t => [t.name, t.dias]));
    y = Math.max(yA, yB) + 10;

    y = ensureSpace(doc, y, 140);
    y1 = sectionHeader2(doc, M, y, halfW, 'Distribuição por prioridade');
    y2 = sectionHeader2(doc, M + halfW + gap, y, halfW, 'Backlog por equipe');
    const yC = drawTable(doc, M, y1, halfW, [{ label: 'Prioridade' }, { label: 'OS', align: 'right', w: 60 }], data.distribuicaoUrgencia.map(p => [p.name, p.total]));
    const yD = drawTable(doc, M + halfW + gap, y2, halfW, [{ label: 'Equipe' }, { label: 'OS', align: 'right', w: 60 }], data.backlogPorEquipe.map(t => [t.name, t.total]));
    y = Math.max(yC, yD);

    // rodapés em todas as páginas
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, data, i + 1, range.count);
    }

    doc.end();
  });
}

// cabeçalho de seção estreito (colunas pareadas)
function sectionHeader2(doc, x, y, w, title) {
  doc.rect(x, y + 3, 14, 2.5).fill(C.gold);
  doc.font('Times-Bold').fontSize(12).fillColor(C.ink).text(title, x + 20, y - 1, { width: w - 20, lineBreak: false });
  y += 15;
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.8).strokeColor(C.line).stroke();
  return y + 10;
}
