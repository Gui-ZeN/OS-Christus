import PDFDocument from 'pdfkit';
import { C, CW, M, PAGE_H, drawTable, ensureSpace, sectionHeader } from './pdfPapel.js';

/**
 * Gera o Relatório Gerencial de OS em PDF no servidor (pdfkit, sem browser) —
 * layout executivo/editorial pra diretoria. Recebe o mesmo `data` que o front já
 * computa (ver KpiView) e devolve um Buffer. Testável localmente (Node).
 */

function niceCeil(v) {
  if (v <= 5) return 5;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
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
    .text(`Sem dados financeiros · pág. ${page}/${total}`, M, fy, { width: CW, align: 'right', lineBreak: false });
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
    y += 13;
    doc.font('Times-Bold').fontSize(21).fillColor(C.ink)
      .text('Relatório Gerencial de Ordens de Serviço', M, y, { lineBreak: false });
    doc.font('Helvetica').fontSize(8.5).fillColor(C.sub)
      .text(`Gerado em ${data.geradoEm}`, M + CW - 160, y + 6, { width: 160, align: 'right', lineBreak: false });
    y += 28;
    doc.rect(M, y, CW, 2.5).fill(C.gold);
    y += 12;

    // ── Recorte ───────────────────────────────────────────────
    // Quebra de linha própria: a lista de filtros é variável (período, sede,
    // região, status, urgência, equipe, fornecedor) e o `lineBreak: false` de
    // cada pedaço faria o excedente sair pela margem sem avisar.
    doc.font('Helvetica').fontSize(9.5);
    const SEP = '  |  ';
    // A aba aberta durante o deploy ainda tem o bundle antigo e manda o formato
    // velho por alguns minutos. Sem esta ponte, o relatório sairia com o recorte em
    // branco — pior que sair errado, porque parece que não havia filtro nenhum.
    const filtros = Array.isArray(data.filtros)
      ? data.filtros
      : [
          { label: 'Período', value: data.periodoLabel },
          { label: 'Sede', value: data.sedeLabel },
          { label: 'Região', value: data.regiaoLabel },
        ].filter(item => item.value);
    let rx = M;
    filtros.forEach((filtro, i) => {
      const rotulo = `${filtro.label}: `;
      const valor = String(filtro.value);
      doc.font('Helvetica');
      const wSep = i > 0 ? doc.widthOfString(SEP) : 0;
      const wRotulo = doc.widthOfString(rotulo);
      doc.font('Helvetica-Bold');
      const wValor = doc.widthOfString(valor);
      if (rx + wSep + wRotulo + wValor > M + CW) {
        rx = M;
        y += 13;
      } else if (i > 0) {
        doc.font('Helvetica').fillColor(C.line).text(SEP, rx, y, { lineBreak: false });
        rx += wSep;
      }
      doc.font('Helvetica').fillColor(C.sub).text(rotulo, rx, y, { lineBreak: false });
      rx += wRotulo;
      doc.font('Helvetica-Bold').fillColor(C.ink).text(valor, rx, y, { lineBreak: false });
      rx += wValor;
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
       { label: 'Concluídas', color: C.green, values: data.osPorSede.map(s => s.concluidas) },
       { label: 'Canceladas', color: C.sub, values: data.osPorSede.map(s => s.canceladas) }],
      true);
    y += 8;
    y = drawTable(doc, M, y, CW,
      [{ label: 'Sede' }, { label: 'Abertas', align: 'right', w: 72 }, { label: 'Concluídas', align: 'right', w: 72 }, { label: 'Canceladas', align: 'right', w: 72 }, { label: 'Total', align: 'right', w: 60 }],
      data.osPorSede.map(s => [s.name, s.abertas, s.concluidas, s.canceladas, s.abertas + s.concluidas + s.canceladas]));
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
    let y2 = sectionHeader2(doc, M + halfW + gap, y, halfW, 'Espera na etapa atual');
    const yA = drawTable(doc, M, y1, halfW, [{ label: 'Faixa' }, { label: 'OS abertas', align: 'right', w: 80 }], data.agingBuckets.map(a => [a.name, a.total]));
    // ⚠️ `null` VIRA TRAVESSÃO, não zero: etapa sem OS não esperou zero dia, o
    // sistema é que não tem o que medir. E a coluna de amostra vai junto — média de
    // uma OS só não é média, e quem lê o papel não tem como perguntar.
    const yB = drawTable(doc, M + halfW + gap, y2, halfW,
      [{ label: 'Etapa' }, { label: 'Dias méd.', align: 'right', w: 60 }, { label: 'OS', align: 'right', w: 40 }],
      data.tempoPorEtapa.map(t => [t.name, t.dias == null ? '—' : t.dias, t.osNaEtapa]));
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
