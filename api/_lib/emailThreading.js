import { repairMojibake } from './text.js';

/**
 * Helpers PUROS de assunto, threading e identidade de mensagem — extraídos do
 * god-file `api/mail.js`. São a base de duas garantias do inbound/outbound:
 *  - a resposta cair na MESMA conversa (Message-Id/In-Reply-To/References);
 *  - o assunto manter o prefixo "OS-XXXX - SEDE" sem duplicar a cada resposta.
 * Sem I/O: dá para testar sem emulador nem Gmail.
 */

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildConversationSubject(ticketId, ticketSubject, fallbackSubject, sede) {
  const cleanSubject = String(ticketSubject || fallbackSubject || '').trim();
  if (!ticketId) return repairMojibake(cleanSubject || fallbackSubject || 'Atualização da OS');
  // Prefixo "OS-XXXX - SEDE" (sede vem do nome resolvido em variables.ticket.sede;
  // se vazia, mantém só "OS-XXXX"). A checagem de idempotência abaixo casa ambos
  // os formatos (com/sem sede), pois os dois começam com "OS-XXXX - ".
  const sedeLabel = repairMojibake(String(sede || '').trim());
  const prefix = sedeLabel ? `${ticketId} - ${sedeLabel}` : ticketId;
  if (!cleanSubject) return `${prefix} - Atualização da OS`;
  if (cleanSubject.toUpperCase().startsWith(`${ticketId.toUpperCase()} - `)) {
    return repairMojibake(cleanSubject);
  }
  return repairMojibake(`${prefix} - ${cleanSubject}`);
}

export function buildReplySubject(subject) {
  const cleanSubject = repairMojibake(String(subject || '').trim());
  if (!cleanSubject) return '';
  return /^(re|res|fw|fwd)\s*:/i.test(cleanSubject) ? cleanSubject : `Re: ${cleanSubject}`;
}

export function isTicketConversationSubject(ticketId, subject) {
  const normalizedTicketId = String(ticketId || '').trim().toUpperCase();
  const normalizedSubject = String(subject || '').trim().toUpperCase();
  return Boolean(normalizedTicketId && normalizedSubject.startsWith(`${normalizedTicketId} - `));
}

// Id determinístico da entrada de histórico do inbound: derivado do messageId para
// que reprocessar a mesma mensagem não duplique a entrada.
export function buildInboundHistoryId(messageId, fallbackKey) {
  const base = String(messageId || fallbackKey || Date.now())
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `mail-${base || Date.now()}`;
}

export function normalizeMessageIdToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const wrapped = raw.startsWith('<') && raw.endsWith('>') ? raw : `<${raw.replace(/^<|>$/g, '')}>`;
  return wrapped;
}

export function parseMessageIdCandidates(inReplyTo, referencesRaw) {
  const candidates = new Set();
  const direct = normalizeMessageIdToken(inReplyTo);
  if (direct) candidates.add(direct);
  String(referencesRaw || '')
    .split(/\s+/)
    .map(token => normalizeMessageIdToken(token))
    .filter(Boolean)
    .forEach(token => candidates.add(token));
  return [...candidates];
}

/**
 * Corta a corrente de References SEM perder a raiz.
 *
 * ⚠️ `.slice(-20)` sozinho fazia o contrário do que o RFC pede. A raiz é a PRIMEIRA
 * da lista e `slice(-20)` guarda as ULTIMAS: passando de 20 mensagens, a ancora da
 * conversa era a primeira coisa a cair. Numa OS longa o encadeamento se rompia
 * exatamente quando a conversa mais importava — e sem erro nenhum, porque
 * referencia faltando nao falha, so deixa de agrupar.
 *
 * O RFC 5322 §3.6.4 manda preservar o inicio da cadeia e cortar o MEIO: a raiz
 * ancora a conversa inteira, e as ultimas mensagens sao as que os clientes usam
 * para pendurar a resposta. O meio e o descartavel.
 *
 * O teto existe porque `References` cresce sem limite e cabecalho gigante e
 * rejeitado por servidor.
 */
export function limitarReferencias(referencias, teto = 20) {
  const lista = [...new Set((Array.isArray(referencias) ? referencias : []).filter(Boolean))];
  if (lista.length <= teto) return lista;
  // A raiz, e depois as mais RECENTES — o meio e que sai.
  return [lista[0], ...lista.slice(-(teto - 1))];
}

