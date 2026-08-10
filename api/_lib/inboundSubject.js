// Parsing PURO do assunto de e-mails de entrada — extraído do god-file mail.js
// para ficar isolado e testável. Sem I/O.

// Extrai o id "OS-####" (>=3 dígitos) de um texto, ou null.
export function parseTicketId(text) {
  if (!text) return null;
  const match = String(text).match(/\bOS-\d{3,}\b/i);
  return match ? match[0].toUpperCase() : null;
}

// Remove prefixos de resposta/encaminhamento repetidos/aninhados (Re:/Fw:/Fwd:).
export function stripReplyForwardPrefixes(text) {
  let next = String(text || '').trim();
  let previous = '';
  while (next && previous !== next) {
    previous = next;
    next = next.replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, '').trim();
  }
  return next;
}

// Tira os prefixos que se acumulam na frente do assunto ao longo de uma thread
// ("Re: Título: [BS] ..."), em qualquer ordem, até estabilizar — assim o colchete
// volta para o início e pode casar.
function stripSubjectPrefixes(text) {
  let normalized = String(text || '').trim();
  let previous = '';
  while (normalized && previous !== normalized) {
    previous = normalized;
    normalized = stripReplyForwardPrefixes(normalized)
      .replace(/^\s*(?:t[ií]tulo|assunto|subject)\s*:\s*/i, '')
      .trim();
  }
  return normalized;
}

/**
 * Todas as leituras plausíveis de "[SEDE] assunto", em ordem de confiança: primeiro
 * o colchete no INÍCIO (a forma que o gabarito pede), depois qualquer outro grupo
 * entre colchetes/parênteses no meio ou no fim.
 *
 * O segundo caso não é hipótese: `Re: SOLICITAÇÃO DE COMPRA [BS]` chegou em 07/08 e
 * foi descartada com "assunto sem [SEDE] reconhecida" — a sede estava lá, só que no
 * fim. Quem escreve não decora o gabarito, e cobrar isso de quem pede manutenção é
 * fazer o sistema ganhar a discussão e perder o chamado.
 *
 * Devolve CANDIDATOS, não um palpite: só quem tem o catálogo em mãos sabe se `[BS]`
 * é sede ou se é `[GitHub]`/`[Action Required]`. Aqui é parsing puro, sem I/O — a
 * validação fica com quem chama.
 */
export function parseNewTicketSubjectCandidates(text) {
  if (!text) return [];
  const normalized = stripSubjectPrefixes(text);
  if (!normalized) return [];

  const candidates = [];
  // O separador depois do [SEDE] é opcional: aceita "[PE] - assunto", "[PE]: assunto"
  // e também "[PE] assunto" (sem traço logo após o colchete — caso comum). O traço
  // interno do assunto ("texto - texto") é preservado.
  const atStart = normalized.match(/^[[({]([^\])}]+)[\])}]\s*[-–—:]?\s*(.+?)\s*$/);
  if (atStart) {
    candidates.push({
      siteCode: String(atStart[1] || '').trim(),
      subject: String(atStart[2] || '').trim(),
    });
  }

  for (const match of normalized.matchAll(/[[({]([^\])}]+)[\])}]/g)) {
    if (match.index === 0) continue; // o do início já entrou acima, com o separador tratado
    const rest = `${normalized.slice(0, match.index)} ${normalized.slice(match.index + match[0].length)}`
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*[-–—:]\s*$/, '')
      .trim();
    if (!rest) continue;
    candidates.push({ siteCode: String(match[1] || '').trim(), subject: rest });
  }

  return candidates.filter(candidate => candidate.siteCode && candidate.subject);
}

// Melhor leitura de "[SEDE] ..." sem consultar catálogo, ou null.
export function parseNewTicketSubject(text) {
  return parseNewTicketSubjectCandidates(text)[0] || null;
}

// Prefixo Re:/Fw: no assunto OU headers de thread (In-Reply-To/References) = a
// mensagem é resposta a uma conversa existente, não uma OS nova.
export function isLikelyThreadReply(message) {
  const hasThreadHeaders = Boolean(
    message.inReplyTo ||
      (Array.isArray(message.references)
        ? message.references.length > 0
        : String(message.references || '').trim())
  );
  if (hasThreadHeaders) return true;
  return /^\s*(?:(?:re|res|fw|fwd|enc)\s*:\s*)+/i.test(String(message.subject || ''));
}
