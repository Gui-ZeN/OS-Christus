import PDFDocument from 'pdfkit';
import { A4_PAISAGEM, C, drawTable } from './pdfPapel.js';

/**
 * A FILA DA GESTÃO NO PAPEL — a lista filtrada, como está na tela.
 *
 * O outro documento da casa é o Relatório Gerencial, e cada um responde a uma
 * pergunta diferente: ele responde "como estamos", a partir dos Indicadores; este
 * responde "o que existe neste recorte" — as 15 do Sul 1 para levar à reunião de
 * sede, a lista de travadas para cobrar o fornecedor.
 *
 * ⚠️ PAISAGEM, e não retrato. Nove colunas não cabem em 499pt sem picar o assunto, e
 * é o assunto que identifica a OS numa fila — "Solicitando reparo para traves da
 * quadra" cortado em "Solicitando reparo para tra…" obriga quem lê a voltar ao
 * sistema, que é exatamente o que o papel existe para evitar.
 *
 * ⚠️ O RECORTE VAI ESCRITO NO CABEÇALHO, sempre. Uma lista sem os filtros que a
 * produziram é uma afirmação falsa: quem receber "23 OS" por e-mail vai ler como "há
 * 23 OS", e não "há 23 OS no Sul 1, em orçamento, fora encerradas". Documento
 * circula — a tela tem os seletores à vista, o papel não tem nada.
 */

/** O texto que descreve o recorte. Puro e testável — é o que impede a leitura falsa. */
export function descreverRecorte(filtros = {}, { total = 0, exibidas = 0 } = {}) {
  // ⚠️ DOIS GRUPOS, e a distinção não é cosmética. `estreita` são as escolhas que
  // tiram OS da lista; `sempre` são duas que valem mesmo sem ninguém tocar em nada —
  // a fila esconde encerradas por padrão e tem uma ordem. Misturar os dois fazia o
  // ramo "sem filtro" virar código morto, porque a lista nunca ficava vazia.
  const estreita = [];
  const põe = (rotulo, valor) => {
    const v = String(valor ?? '').trim();
    if (v && v !== 'todas' && v !== 'todos') estreita.push(`${rotulo}: ${v}`);
  };
  põe('Sede', filtros.sede);
  põe('Macroserviço', filtros.macroServico);
  põe('Serviço', filtros.servico);
  põe('Equipe', filtros.equipe);
  põe('Responsável', filtros.responsavel);
  põe('Etapa', filtros.etapa);
  if (filtros.busca) estreita.push(`Busca: "${String(filtros.busca).trim()}"`);
  if (filtros.travadas) estreita.push('Somente travadas');
  if (filtros.agua) estreita.push('Somente problemas de água');

  const sempre = [
    filtros.mostrarEncerradas ? 'Inclui encerradas e canceladas' : 'Sem encerradas e canceladas',
    filtros.ordem === 'parada' ? 'Mais paradas primeiro' : 'Mais recentes primeiro',
  ];

  return {
    // Sem nenhum filtro que estreite, o recorte é a fila inteira — dizer isso é mais
    // honesto que deixar a frase começar pela ordenação e parecer que o filtro sumiu.
    filtros: [estreita.length ? estreita.join(' · ') : 'Sem filtros — fila completa', ...sempre].join(' · '),
    contagem: `${exibidas} de ${total} OS`,
  };
}

const COLUNAS = [
  { label: 'OS', w: 60 },
  { label: 'Assunto' },
  { label: 'Sede', w: 46 },
  { label: 'Serviço', w: 88 },
  { label: 'Equipe', w: 78 },
  { label: 'Responsável', w: 88 },
  { label: 'Etapa', w: 92 },
  // 50 e não 42: medido, "MARCOS" pede 38pt de largura útil e a coluna dava 30 — o
  // cabeçalho partia no meio da palavra ("MARC / OS"). Os 8pt saem do Assunto, que é
  // a coluna elástica. "PARADA HÁ" também quebra, mas entre palavras, e lê bem.
  { label: 'Marcos', w: 50, align: 'center' },
  { label: 'Parada há', w: 58, align: 'right' },
];

export async function buildListaPdf(data) {
  const { M, CW, PAGE_H } = A4_PAISAGEM;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: M, bottom: 0, left: M, right: M },
      bufferPages: true,
    });
    const pedacos = [];
    doc.on('data', pedaco => pedacos.push(pedaco));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    let y = M;

    // ── Cabeçalho ─────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.gold)
      .text('GRUPO CHRISTUS · MANUTENÇÃO', M, y, { characterSpacing: 1.6, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(C.sub)
      .text(`Gerado em ${data.geradoEm}${data.geradoPor ? ` · ${data.geradoPor}` : ''}`, M, y, {
        width: CW,
        align: 'right',
        lineBreak: false,
      });
    y += 15;

    doc.font('Times-Bold').fontSize(20).fillColor(C.ink).text('Gestão de OS', M, y, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.goldDeep)
      .text(data.contagem, M, y + 6, { width: CW, align: 'right', lineBreak: false });
    y += 26;

    // O recorte, na altura dos olhos: é a primeira coisa que se lê depois do título.
    doc.font('Helvetica').fontSize(8.5).fillColor(C.body);
    const alturaDoRecorte = doc.heightOfString(data.filtros, { width: CW });
    doc.text(data.filtros, M, y, { width: CW });
    y += alturaDoRecorte + 8;

    doc.rect(M, y, CW, 2.5).fill(C.gold);
    y += 12;

    // ── A fila ────────────────────────────────────────────────
    y = drawTable(doc, M, y, CW, COLUNAS, data.linhas, 'Nenhuma OS neste recorte.', A4_PAISAGEM);

    // O asterisco da coluna Marcos precisa de legenda NO PAPEL: na tela ele tem
    // tooltip, aqui não tem para onde apontar. Só aparece quando alguma linha o usa.
    const temAsterisco = (data.linhas || []).some(linha =>
      String(linha?.[7] ?? '').includes('*')
    );
    if (temAsterisco) {
      doc.font('Helvetica').fontSize(7.5).fillColor(C.sub)
        .text('* Inclui marco que aconteceu sem data registrada no sistema.', M, y + 8, { width: CW });
    }

    // ── Rodapé em todas as páginas ────────────────────────────
    const total = doc.bufferedPageRange().count;
    for (let i = 0; i < total; i += 1) {
      doc.switchToPage(i);
      const fy = PAGE_H - M - 6;
      doc.moveTo(M, fy - 8).lineTo(M + CW, fy - 8).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(C.sub)
        .text('Serv3 · retrato do momento em que foi gerado, não relatório histórico.', M, fy, { lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.sub)
        .text(`${i + 1} / ${total}`, M, fy, { width: CW, align: 'right', lineBreak: false });
    }

    doc.end();
  });
}
