import { stripQuoteMarkers, stripSignature, tidyInboundText, unwrapQuoteHeaders } from './inboundBody.js';

/**
 * Reconstrói as mensagens ANTERIORES a partir do histórico citado de um e-mail.
 *
 * Por que isto existe: uma conversa costuma rodar semanas entre as pessoas antes
 * de alguém pôr o Serv3 em cópia. As mensagens de antes nunca chegaram à caixa do
 * sistema — pedir a thread ao Gmail devolve só o que aquela conta recebeu. Mas
 * elas vêm DENTRO da mensagem que chegou, citadas. Na OS-0345 eram 18 mensagens,
 * de abril a agosto, atrás de um corpo de 24 caracteres ("Bom dia, Serv 3 em
 * cópia.") — incluindo o orçamento e a autorização.
 *
 * A ingestão joga a citação fora DE PROPÓSITO (`stripQuotedReply`): repetir o
 * histórico a cada resposta encheria a OS de cópias. Este módulo é o caminho
 * inverso, usado só por importação explícita — nunca no fluxo de entrada.
 *
 * O QUE NÃO VEM: anexos. A citação carrega texto; as fotos e as planilhas das
 * mensagens antigas ficaram nas caixas de quem participou. Uma tabela de orçamento
 * citada chega como texto corrido.
 */

const MESES = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

// "Em qua., 12 de ago. de 2026 às 09:56, Fulano <f@ex.com> escreveu:"
// O endereço aceita espaço interno de propósito: exportação de HTML quebra
// linha no meio dele ("christus.com. br") e o e-mail some junto com a mensagem.
// O "às" é opcional: o Gmail alterna entre "de 2026 às 10:02," e "de 2026, 10:02,"
// no MESMO e-mail, e exigi-lo fazia a mensagem sumir e o corpo dela ser engolido
// pela anterior.
// O dia da semana é opcional e pode ter acento ("sáb.") — daí `[^\s,]+` e não
// `\w+`, que em JS não casa letra acentuada e engolia a mensagem inteira,
// grudando o corpo dela na anterior.
const MARCADOR_PT =
  /^[ \t>]*Em\s+(?:[^\s,]+,\s*)?(\d{1,2})\s+de\s+([^\s.,]{3})[^\s.,]*\.?\s+de\s+(\d{4})[,]?\s+(?:às\s+|as\s+)?(\d{1,2}):(\d{2})(?:\s*([AaPp])\.?[Mm]\.?)?\s*,\s*(.+?)\s*<\s*([^>]+?@[^>]+?)\s*>\s*escreveu:[ \t]*$/;

// Fortaleza não tem horário de verão: o deslocamento é -03:00 o ano inteiro. O
// Gmail renderiza a citação no fuso de quem lê, que é o mesmo de quem escreveu.
const FUSO_FORTALEZA_MIN = -180;

function montarData(dia, mesTexto, ano, hora, minuto, meridiano) {
  const mes = MESES[String(mesTexto).toLowerCase()];
  if (mes === undefined) return null;
  // Parte dos clientes escreve em relógio de 12 horas ("às 3:36 PM").
  let h = Number(hora);
  const m = String(meridiano || '').toLowerCase();
  if (m === 'p' && h < 12) h += 12;
  if (m === 'a' && h === 12) h = 0;
  const utc = Date.UTC(Number(ano), mes, Number(dia), h, Number(minuto));
  const data = new Date(utc - FUSO_FORTALEZA_MIN * 60 * 1000);
  return Number.isNaN(data.getTime()) ? null : data;
}

function limparCorpo(linhas) {
  const bruto = stripQuoteMarkers(linhas.join('\n'));
  return tidyInboundText(stripSignature(bruto)).trim();
}

/**
 * @param {string} texto corpo do e-mail (texto puro; HTML deve vir convertido)
 * @returns {{ time: Date, sender: string, email: string, text: string }[]}
 *          da mais antiga para a mais recente, sem as sem-data e sem as vazias
 */
export function parseQuotedChain(texto) {
  const linhas = unwrapQuoteHeaders(texto).split('\n');
  const mensagens = [];
  let atual = null;

  for (const linha of linhas) {
    const m = linha.match(MARCADOR_PT);
    if (m) {
      if (atual) mensagens.push(atual);
      atual = {
        time: montarData(m[1], m[2], m[3], m[4], m[5], m[6]),
        sender: m[7].replace(/\s+/g, ' ').trim(),
        email: m[8].replace(/\s+/g, '').toLowerCase(),
        linhas: [],
      };
      continue;
    }
    if (atual) atual.linhas.push(linha);
  }
  if (atual) mensagens.push(atual);

  return mensagens
    .map(({ linhas: corpo, ...resto }) => ({ ...resto, text: limparCorpo(corpo) }))
    // Sem data não dá para posicionar a mensagem na conversa, e chutar uma data
    // num histórico de auditoria é pior que não importar.
    .filter(item => item.time instanceof Date && item.text.length > 0)
    .sort((a, b) => a.time - b.time);
}

/**
 * A mesma mensagem costuma aparecer duas vezes: o e-mail traz a corrente em
 * text/plain E em HTML, e a exportação do Gmail ainda renderiza a conversa
 * recolhida e expandida.
 *
 * A chave é remetente+minuto, e NÃO inclui o texto de propósito: quando um
 * cabeçalho de citação aninhado não casa numa das versões, o corpo daquela
 * mensagem engole o cabeçalho seguinte e todo o resto. As duas cópias então
 * diferem no texto e as duas passariam — foi o que aconteceu na OS-0210, com
 * "Rafael, Aguardar." aparecendo uma vez limpa e outra arrastando a citação
 * inteira atrás. Vence a MAIS CURTA: a que engoliu é sempre a maior.
 */
export function dedupeQuotedChain(mensagens) {
  const vistas = new Map();
  for (const item of mensagens) {
    const chave = `${item.email}|${item.time.toISOString().slice(0, 16)}`;
    const anterior = vistas.get(chave);
    if (!anterior || item.text.length < anterior.text.length) vistas.set(chave, item);
  }
  return [...vistas.values()].sort((a, b) => a.time - b.time);
}
