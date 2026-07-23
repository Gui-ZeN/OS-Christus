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

// Extrai { siteCode, subject } de um assunto "[SEDE] ...", ou null.
export function parseNewTicketSubject(text) {
  if (!text) return null;
  // Remove prefixos de resposta/encaminhamento E um rótulo "Título:/Assunto:" que
  // alguns e-mails colocam antes do [SEDE] (ex.: "Re: Título: [BS] ..."), em
  // qualquer ordem, até estabilizar — assim o colchete volta ao início e casa.
  let normalizedSubject = String(text).trim();
  let previous = '';
  while (normalizedSubject && previous !== normalizedSubject) {
    previous = normalizedSubject;
    normalizedSubject = stripReplyForwardPrefixes(normalizedSubject)
      .replace(/^\s*(?:t[ií]tulo|assunto|subject)\s*:\s*/i, '')
      .trim();
  }
  // O separador depois do [SEDE] é opcional: aceita "[PE] - assunto", "[PE]: assunto"
  // e também "[PE] assunto" (sem traço logo após o colchete — caso comum). O traço
  // interno do assunto ("texto - texto") é preservado.
  const match = normalizedSubject.match(/^\s*[\[\(\{]([^\]\)\}]+)[\]\)\}]\s*[-–—:]?\s*(.+?)\s*$/i);
  if (!match) return null;
  return {
    siteCode: String(match[1] || '').trim(),
    subject: String(match[2] || '').trim(),
  };
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
