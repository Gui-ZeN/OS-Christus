import PDFDocument from 'pdfkit';
import { BOTTOM, C, CW, M, PAGE_H, drawTable, ensureSpace, sectionHeader } from './pdfPapel.js';
import { toDateOrNull } from './dates.js';
import { etapaDe } from './etapas.js';
import { isPublicTrackingHistoryEntry } from './historicoPublico.js';
import { TICKET_STATUS } from './statusFlow.js';

/**
 * O RETRATO DE UMA OS — o estado de agora, em PDF, para levar a campo ou à reunião.
 *
 * Não é relatório histórico: é o que está REGISTRADO no instante em que alguém
 * clicou. Por isso a página não tem gráfico de tendência nem comparação com o mês
 * passado — tem os campos, a linha do tempo e os últimos registros da conversa.
 *
 * ⚠️ O QUE SAI DAQUI CIRCULA. O relatório gerencial vive numa tela com sessão; este
 * arquivo é encaminhado por e-mail, impresso e esquecido em cima de uma mesa. As três
 * decisões abaixo são disso, e não de layout:
 *
 *  1. **A conversa passa pelo mesmo corte da página pública** (`historicoPublico.js`).
 *     O que o solicitante já leria no `?tracking=TOKEN` pode sair no papel; nota
 *     interna, valor e menção a orçamento/contrato/pagamento, não. Reutilizar a regra
 *     existente em vez de escrever uma segunda foi deliberado: duas respostas para
 *     "isto pode sair do prédio" divergem em silêncio, e a que vaza é sempre a nova.
 *  2. **Nada de dinheiro.** Nem cotação, nem parcela, nem `releasedPercent` — o
 *     percentual FÍSICO da execução entra, o financeiro não. O rodapé diz isso em
 *     todas as páginas, como o relatório gerencial já dizia.
 *  3. **Anexo entra como nome e data, nunca como link.** As URLs do Cloud Storage são
 *     assinadas e expiram; link morto num documento impresso é pior que ausência,
 *     porque parece que o sistema perdeu o arquivo.
 *
 * O escopo por região/sede de quem pediu é conferido na ROTA (`?route=ticket-pdf`),
 * antes de chegar aqui — este módulo desenha, não autoriza.
 */

/**
 * Os seis marcos da régua da coordenação — espelho de `MARCOS_DA_OS` em
 * `src/utils/marcos.ts`, guardado por `tests/unit/ticketPdf.test.ts`.
 *
 * Duplicado porque front e back são deploys separados e o mapa `ticket.marcos` é
 * gravado pelo servidor (`addStageMarco`); a mesma solução do enum de status, que já
 * vive nos dois lados com teste de sincronia.
 */
export const MARCOS_DA_OS = [
  { chave: TICKET_STATUS.WAITING_TECH_OPINION, rotulo: 'Visita técnica' },
  { chave: TICKET_STATUS.WAITING_SOLUTION_APPROVAL, rotulo: 'Aprovação da solução' },
  { chave: TICKET_STATUS.WAITING_BUDGET, rotulo: 'Orçamento' },
  { chave: TICKET_STATUS.WAITING_PRELIM_ACTIONS, rotulo: 'Ações preliminares' },
  { chave: TICKET_STATUS.IN_PROGRESS, rotulo: 'Início da execução' },
  { chave: TICKET_STATUS.CLOSED, rotulo: 'Conclusão' },
];

/**
 * Os motivos de parada por extenso — espelho de `SUSPENSION_REASON_LABEL` em
 * `src/constants/agenda.ts`, guardado pelo mesmo teste dos marcos.
 *
 * O banco guarda o código (`aguardando-material`), e num documento impresso código
 * lido por gente é ruído. Motivo desconhecido sai como veio, e não em branco: valor
 * que ninguém mapeou precisa ser visível para alguém notar.
 */
export const MOTIVO_DA_PARADA = {
  'aguardando-material': 'Aguardando material',
  'aguardando-aprovacao': 'Aguardando aprovação',
  'aguardando-terceiro': 'Aguardando terceiro',
  'aguardando-orcamento': 'Aguardando orçamento',
  'sem-verba': 'Sem verba no momento',
  'depende-de-periodo': 'Depende de período (férias, chuva…)',
  outro: 'Outro',
};

/** Quantos registros da conversa entram no papel. */
const REGISTROS_NA_CONVERSA = 10;

/** Corte de um registro longo. Sai com marca visível — abreviar calado é mentir. */
const LIMITE_DO_TEXTO = 700;

const VAZIO = '—';

const dataCurta = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Fortaleza',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dataComHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Fortaleza',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function emDia(valor) {
  const data = toDateOrNull(valor);
  return data ? dataCurta.format(data) : null;
}

function emDiaEHora(valor) {
  const data = toDateOrNull(valor);
  return data ? dataComHora.format(data) : null;
}

function texto(valor) {
  const limpo = String(valor ?? '').trim();
  return limpo || null;
}

function sim(valor) {
  return valor ? 'sim' : 'não';
}

function abreviar(valor) {
  const limpo = String(valor ?? '').replace(/\s+/g, ' ').trim();
  return limpo.length > LIMITE_DO_TEXTO ? `${limpo.slice(0, LIMITE_DO_TEXTO)} […]` : limpo;
}

/** Campo que só aparece quando existe: linha em branco não informa nada. */
function campo(label, value) {
  const conteudo = texto(value);
  return conteudo ? { label, value: conteudo } : null;
}

function diasEntre(de, ate) {
  const inicio = toDateOrNull(de);
  if (!inicio) return null;
  return Math.max(0, Math.floor((ate.getTime() - inicio.getTime()) / 86_400_000));
}

function comDias(valor, agora) {
  const quando = emDiaEHora(valor);
  if (!quando) return VAZIO;
  const dias = diasEntre(valor, agora);
  if (dias === null) return quando;
  if (dias === 0) return `${quando} (hoje)`;
  return `${quando} (${dias} ${dias === 1 ? 'dia' : 'dias'})`;
}

function registroDaProximaAcao(ticket) {
  const proxima = ticket.nextAction;
  const oQue = texto(proxima?.what);
  if (!oQue) {
    return {
      titulo: 'Próxima ação',
      itens: [],
      // Constatação, não cobrança: a tela e o PDF descrevem o que está registrado.
      nota: 'Nenhuma próxima ação registrada nesta OS.',
    };
  }
  return {
    titulo: 'Próxima ação',
    itens: [
      campo('O que', oQue),
      campo('Quando', emDia(proxima.dueAt)),
      campo('Responsável pela ação', proxima.ownerName || proxima.ownerEmail),
    ].filter(Boolean),
  };
}

function registroDaParada(ticket) {
  const parada = ticket.attention;
  if (!parada || String(parada.state || '') !== 'suspensa') return null;
  return {
    titulo: 'Parada declarada',
    itens: [
      campo('Motivo', MOTIVO_DA_PARADA[String(parada.reason || '')] || parada.reason),
      campo('Detalhe', parada.note),
      campo('Revisar em', emDia(parada.reviewAt)),
      campo('Declarada por', parada.setByName || parada.setBy),
    ].filter(Boolean),
  };
}

function registroDaExecucao(ticket) {
  const execucao = ticket.executionProgress;
  if (!execucao || typeof execucao !== 'object') return null;
  const itens = [
    // `releasedPercent` fica FORA: é liberação de dinheiro, e este papel circula.
    campo('Conclusão física', Number.isFinite(Number(execucao.currentPercent)) ? `${Number(execucao.currentPercent)}%` : null),
    campo('Execução iniciada em', emDia(execucao.startedAt)),
    campo('Última atualização', emDiaEHora(execucao.lastUpdatedAt)),
  ].filter(Boolean);
  return itens.length ? { titulo: 'Execução', itens } : null;
}

function registroDasPreliminares(ticket) {
  const preliminares = ticket.preliminaryActions;
  if (!preliminares || typeof preliminares !== 'object') return null;
  return {
    titulo: 'Ações preliminares',
    itens: [
      campo('Material solicitado', sim(preliminares.materialRequested)),
      campo('Previsão do material', emDia(preliminares.materialEta)),
      campo('Equipe confirmada', sim(preliminares.teamConfirmed)),
      campo('Local preparado', sim(preliminares.sitePrepared)),
      campo('Data definida', sim(preliminares.scheduleDefined)),
      campo('Envolvidos alinhados', sim(preliminares.stakeholderAligned)),
      campo('Acesso liberado', sim(preliminares.accessReleased)),
      campo('Início planejado', emDia(preliminares.plannedStartAt)),
      campo('Início real', emDia(preliminares.actualStartAt)),
      campo('Impedimentos anotados', preliminares.blockerNotes),
    ].filter(Boolean),
  };
}

function registroDoEncerramento(ticket) {
  const checklist = ticket.closureChecklist;
  if (!checklist || typeof checklist !== 'object') return null;
  return {
    titulo: 'Encerramento',
    itens: [
      campo('Solicitante validou', sim(checklist.requesterApproved)),
      campo('Validado em', emDiaEHora(checklist.requesterApprovedAt)),
      campo('Aprovação da infraestrutura (1)', sim(checklist.infrastructureApprovalPrimary)),
      campo('Aprovação da infraestrutura (2)', sim(checklist.infrastructureApprovalSecondary)),
      campo('Serviço iniciado em', emDia(checklist.serviceStartedAt)),
      campo('Serviço concluído em', emDia(checklist.serviceCompletedAt)),
      campo('Observações do encerramento', checklist.closureNotes),
    ].filter(Boolean),
  };
}

function registroDaGarantia(ticket) {
  const garantia = ticket.guarantee;
  if (!garantia || typeof garantia !== 'object') return null;
  const itens = [
    campo('Prazo', Number(garantia.months) ? `${Number(garantia.months)} meses` : null),
    campo('Início', emDia(garantia.startAt)),
    campo('Fim', emDia(garantia.endAt)),
    // `guarantee.status` fica de fora: é código do banco (`pending`/`active`), e não
    // existe rótulo em português para ele em lugar nenhum do sistema — a própria
    // tela deriva a situação das datas. Imprimir "pending" seria inventar vocabulário.
  ].filter(Boolean);
  return itens.length ? { titulo: 'Garantia', itens } : null;
}

/**
 * O ESTADO DA OS em forma de documento — puro, sem I/O, testável sozinho.
 *
 * Recebe a OS já lida do Firestore (com o histórico hidratado pela rota) e devolve
 * exatamente o que o desenho precisa. Separado do desenho de propósito: é aqui que
 * mora o corte de visibilidade, e regra que decide o que vaza tem que ser afirmável
 * por teste sem precisar abrir um PDF.
 */
export function montarEstadoDaOs(ticket, { agora = new Date(), geradoPor = '' } = {}) {
  const entradas = Array.isArray(ticket?.history) ? ticket.history : [];
  const publicas = entradas.filter(isPublicTrackingHistoryEntry);
  const conversa = publicas.slice(-REGISTROS_NA_CONVERSA).map(item => ({
    quando: emDiaEHora(item.time) || VAZIO,
    autor: texto(item.sender) || 'Sistema',
    texto: abreviar(item.text),
  }));

  const anexos = (Array.isArray(ticket?.attachments) ? ticket.attachments : [])
    .filter(anexo => anexo && typeof anexo === 'object')
    .map(anexo => ({
      nome: texto(anexo.name) || 'arquivo sem nome',
      quando: emDia(anexo.uploadedAt) || VAZIO,
    }));

  const registros = [
    registroDaProximaAcao(ticket),
    registroDaParada(ticket),
    registroDaExecucao(ticket),
    registroDasPreliminares(ticket),
    registroDoEncerramento(ticket),
    registroDaGarantia(ticket),
  ].filter(Boolean);

  return {
    id: texto(ticket?.id) || VAZIO,
    assunto: texto(ticket?.subject) || 'OS sem assunto registrado',
    geradoEm: emDiaEHora(agora),
    geradoPor: texto(geradoPor) || '',

    etapa: etapaDe(ticket?.status) || VAZIO,
    status: texto(ticket?.status) || VAZIO,
    naEtapaDesde: comDias(ticket?.stageEnteredAt || ticket?.time, agora),
    responsavel: texto(ticket?.responsible?.name) || 'sem responsável definido',
    prioridade: texto(ticket?.priority) || VAZIO,

    identificacao: [
      campo('Solicitante', ticket?.requester),
      campo('E-mail do solicitante', ticket?.requesterEmail),
      campo('Aberta em', comDias(ticket?.time, agora)),
      campo('Encerrada em', emDiaEHora(ticket?.closedAt)),
      campo('Status gravado', ticket?.status),
      campo('Tipo', ticket?.type),
      campo('Região', ticket?.region),
      campo('Sede', ticket?.sede),
      campo('Setor', ticket?.sector),
      campo('Local', ticket?.location),
      campo('Macroserviço', ticket?.macroServiceName),
      campo('Serviço', ticket?.serviceCatalogName),
      campo('Equipe', ticket?.assignedTeam),
      ticket?.waterIssue ? { label: 'Problema de água', value: 'sim' } : null,
    ].filter(Boolean),

    marcos: MARCOS_DA_OS.map(marco => ({
      rotulo: marco.rotulo,
      data: emDia(ticket?.marcos?.[marco.chave]) || VAZIO,
    })),
    marcosComData: MARCOS_DA_OS.filter(marco => emDia(ticket?.marcos?.[marco.chave])).length,

    registros,
    conversa,
    // O que o corte deixou de fora, contado — omissão silenciosa se lê como ausência.
    conversaOmitida: entradas.length - publicas.length,
    conversaAnterior: Math.max(0, publicas.length - conversa.length),
    anexos,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O desenho
// ─────────────────────────────────────────────────────────────────────────────

/** Grade de dois campos por linha, com altura que acompanha o texto que sobrar. */
function gradeDeCampos(doc, y, campos) {
  const colW = (CW - 20) / 2;
  for (let i = 0; i < campos.length; i += 2) {
    const par = campos.slice(i, i + 2);
    doc.font('Helvetica').fontSize(9.5);
    const alturaDoValor = Math.max(...par.map(c => doc.heightOfString(c.value, { width: colW })));
    const alturaDaLinha = alturaDoValor + 12;
    y = ensureSpace(doc, y, alturaDaLinha + 4);
    par.forEach((c, coluna) => {
      const x = M + (colW + 20) * coluna;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.sub)
        .text(c.label.toUpperCase(), x, y, { width: colW, characterSpacing: 0.4, lineBreak: false });
      doc.font('Helvetica').fontSize(9.5).fillColor(C.ink)
        .text(c.value, x, y + 9, { width: colW });
    });
    y += alturaDaLinha + 4;
  }
  return y;
}

/** Uma frase do próprio documento — o que ele deixou de fora, o que um número não é. */
function nota(doc, y, frase) {
  doc.font('Times-Italic').fontSize(8.5);
  const altura = doc.heightOfString(frase, { width: CW });
  y = ensureSpace(doc, y, altura + 6);
  doc.fillColor(C.sub).text(frase, M, y, { width: CW });
  return y + altura + 6;
}

function blocoDeRegistro(doc, y, registro) {
  y = sectionHeader(doc, y, registro.titulo);
  for (const item of registro.itens) {
    doc.font('Helvetica').fontSize(9.5);
    const larguraDoValor = CW - 150;
    const altura = Math.max(12, doc.heightOfString(item.value, { width: larguraDoValor }));
    y = ensureSpace(doc, y, altura + 5);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.sub)
      .text(item.label, M, y + 1, { width: 142, lineBreak: false });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.ink)
      .text(item.value, M + 150, y, { width: larguraDoValor });
    y += altura + 5;
  }
  if (registro.nota) y = nota(doc, y, registro.nota);
  return y + 6;
}

function blocoDaConversa(doc, y, data) {
  y = sectionHeader(doc, y, 'Últimos registros da conversa');
  if (data.conversa.length === 0) {
    y = nota(doc, y, 'Nenhum registro desta OS pode sair em documento impresso.');
  }
  for (const entrada of data.conversa) {
    const cabecalho = `${entrada.quando} · ${entrada.autor}`;
    doc.font('Helvetica').fontSize(9.5);
    const alturaDoTexto = doc.heightOfString(entrada.texto, { width: CW - 10 });
    y = ensureSpace(doc, y, Math.min(alturaDoTexto, 120) + 24);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.goldDeep)
      .text(cabecalho, M, y, { width: CW, lineBreak: false });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.body)
      .text(entrada.texto, M + 10, y + 11, { width: CW - 10 });
    y += alturaDoTexto + 20;
    // Recalcula: um texto longo pode ter atravessado a quebra de página sozinho.
    if (y > BOTTOM) {
      doc.addPage();
      y = M;
    }
  }
  const pedacos = [];
  if (data.conversaAnterior > 0) {
    pedacos.push(`${data.conversaAnterior} registro(s) anterior(es) ficaram fora por espaço`);
  }
  if (data.conversaOmitida > 0) {
    pedacos.push(`${data.conversaOmitida} registro(s) interno(s) ou financeiro(s) não entram neste documento`);
  }
  if (pedacos.length) y = nota(doc, y, `${pedacos.join('; ')}. A OS completa está no sistema.`);
  return y + 4;
}

function rodape(doc, pagina, total, data) {
  const fy = PAGE_H - M - 6;
  doc.moveTo(M, fy - 6).lineTo(M + CW, fy - 6).lineWidth(1.5).strokeColor(C.gold).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.body)
    .text(`Grupo Christus · Serv3 — ${data.id}`, M, fy, { lineBreak: false });
  doc.font('Helvetica').fontSize(8).fillColor(C.sub)
    .text(`Sem dados financeiros e sem registro interno · pág. ${pagina}/${total}`, M, fy, {
      width: CW,
      align: 'right',
      lineBreak: false,
    });
}

/** Desenha o retrato e devolve o Buffer do PDF. */
export async function buildTicketPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: 0, left: M, right: M }, bufferPages: true });
    const pedacos = [];
    doc.on('data', pedaco => pedacos.push(pedaco));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);

    let y = M;

    // ── Cabeçalho ─────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.gold)
      .text('GRUPO CHRISTUS · MANUTENÇÃO', M, y, { characterSpacing: 1.6, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(C.sub)
      .text(`Estado em ${data.geradoEm}${data.geradoPor ? ` · ${data.geradoPor}` : ''}`, M, y, {
        width: CW,
        align: 'right',
        lineBreak: false,
      });
    y += 15;
    doc.font('Times-Bold').fontSize(22).fillColor(C.ink).text(data.id, M, y, { lineBreak: false });
    y += 28;
    doc.font('Times-Italic').fontSize(12).fillColor(C.body);
    const alturaDoAssunto = doc.heightOfString(data.assunto, { width: CW });
    doc.text(data.assunto, M, y, { width: CW });
    y += alturaDoAssunto + 8;
    doc.rect(M, y, CW, 2.5).fill(C.gold);
    y += 12;

    // ── Onde a OS está agora ──────────────────────────────────
    const faixa = [
      { label: 'Etapa', value: data.etapa },
      { label: 'Nesta etapa desde', value: data.naEtapaDesde },
      { label: 'Responsável', value: data.responsavel },
      { label: 'Prioridade', value: data.prioridade },
    ];
    const alturaDaFaixa = 50;
    doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(C.line).stroke();
    const larguraDaCelula = CW / faixa.length;
    faixa.forEach((celula, i) => {
      const x = M + larguraDaCelula * i;
      if (i > 0) doc.moveTo(x, y + 6).lineTo(x, y + alturaDaFaixa - 6).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.sub)
        .text(celula.label.toUpperCase(), x + 10, y + 9, { width: larguraDaCelula - 16, characterSpacing: 0.4, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink)
        .text(celula.value, x + 10, y + 21, { width: larguraDaCelula - 16, height: alturaDaFaixa - 26 });
    });
    y += alturaDaFaixa;
    doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(C.line).stroke();
    y += 14;

    // ── Identificação ─────────────────────────────────────────
    y = sectionHeader(doc, y, 'Identificação');
    y = gradeDeCampos(doc, y, data.identificacao);
    y += 6;

    // ── Linha do tempo ────────────────────────────────────────
    y = ensureSpace(doc, y, 60 + data.marcos.length * 15);
    y = sectionHeader(doc, y, 'Linha do tempo');
    y = drawTable(
      doc,
      M,
      y,
      CW,
      [{ label: 'Marco' }, { label: 'Data', align: 'right', w: 140 }],
      data.marcos.map(marco => [marco.rotulo, marco.data]),
      'A OS não tem marco registrado.'
    );
    y += 6;
    // ⚠️ A fração NÃO é degrau: 45% das linhas da planilha da coordenação pulam etapa.
    y = nota(
      doc,
      y,
      `${data.marcosComData} dos 6 marcos com data. Marco sem data significa "não aconteceu" ou "o sistema não sabe" — não é pendência, e a régua não é obrigatória.`
    );
    y += 4;

    // ── Registros ─────────────────────────────────────────────
    for (const registro of data.registros) {
      y = ensureSpace(doc, y, 70);
      y = blocoDeRegistro(doc, y, registro);
    }

    // ── Conversa ──────────────────────────────────────────────
    y = ensureSpace(doc, y, 80);
    y = blocoDaConversa(doc, y, data);

    // ── Anexos ────────────────────────────────────────────────
    y = ensureSpace(doc, y, 80);
    y = sectionHeader(doc, y, 'Anexos');
    y = drawTable(
      doc,
      M,
      y,
      CW,
      [{ label: 'Arquivo' }, { label: 'Enviado em', align: 'right', w: 140 }],
      data.anexos.map(anexo => [anexo.nome, anexo.quando]),
      'Nenhum anexo registrado nesta OS.'
    );
    if (data.anexos.length) {
      y = nota(doc, y + 6, 'Os arquivos não viajam neste PDF: eles ficam na OS, no sistema.');
    }

    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);
      rodape(doc, i + 1, paginas.count, data);
    }

    doc.end();
  });
}
