import { decodeMimeHeader } from './gmail.js';
import { firstEmail } from './email.js';
import { normalizeKey } from './text.js';

/**
 * Limpeza PURA do conteudo de e-mail recebido — extraida do god-file `api/mail.js`.
 * O que chega do Gmail vem embrulhado em ruido (assinatura, historico citado,
 * cabecalhos de encaminhamento) e o que sobra daqui e o que o usuario le como
 * mensagem na OS. Sem I/O: da para testar sem emulador nem Gmail.
 */

export function displayNameFromEmail(raw) {
  const input = decodeMimeHeader(String(raw || '')).trim();
  if (!input) return 'Solicitante por e-mail';

  const angleMatch = input.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  const bareNameMatch = input.match(/^\s*"?([^"<@]+?)"?\s*$/);

  const candidate = (angleMatch?.[1] || bareNameMatch?.[1] || '').trim();
  if (candidate && !candidate.includes('@')) {
    return candidate.replace(/^"+|"+$/g, '').trim();
  }

  const email = firstEmail(input);
  if (!email) return 'Solicitante por e-mail';
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export function hasWaterIssueSignal(value) {
  const normalized = normalizeKey(value);
  if (!normalized) return false;
  return normalized.includes('goteira') || normalized.includes('infiltracao') || normalized.includes('infiltra');
}

export function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isForwardHeaderLine(line) {
  const normalized = String(line || '').trim();
  if (!normalized) return false;
  return /^(from|de|date|data|to|para|subject|assunto|cc|cco|enviado)\s*:/i.test(normalized);
}

export function extractForwardedMessageBody(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const markerRegex = /^\s*(?:-+\s*)?(?:forwarded message|mensagem encaminhada)(?:\s*-+)?\s*$/im;
  const marker = markerRegex.exec(text);
  if (!marker) return '';

  const preface = text.slice(0, marker.index).trim();
  const forwardedRaw = text.slice(marker.index + marker[0].length).trim();
  if (!forwardedRaw) return preface;

  const lines = forwardedRaw.split('\n');
  let pointer = 0;
  while (pointer < lines.length && !lines[pointer].trim()) pointer += 1;

  let headerLines = 0;
  while (pointer < lines.length) {
    const current = lines[pointer].trim();
    if (!current) {
      pointer += 1;
      if (headerLines > 0) break;
      continue;
    }
    if (isForwardHeaderLine(current) || /^-+$/.test(current)) {
      headerLines += 1;
      pointer += 1;
      continue;
    }
    if (/^(on|em)\s.+(wrote|escreveu):\s*$/i.test(current)) {
      pointer += 1;
      continue;
    }
    break;
  }

  const forwardedBody = lines.slice(pointer).join('\n').trim();
  if (!forwardedBody) return preface;
  return [preface, forwardedBody].filter(Boolean).join('\n\n').trim();
}

export function stripQuotedReply(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const markers = [
    /^\s*On .+ wrote:?\s*$/im,
    /^\s*Em .+ escreveu:?\s*$/im,
    /^\s*-----Original Message-----\s*$/im,
    /^\s*De:\s.+$/im,
  ];
  let next = text;

  for (const marker of markers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }

  const inlineMarkers = [
    /\bEm\s.+?<[^>\n]+>\s+escreveu:\s*/i,
    /\bOn\s.+?<[^>\n]+>\s+wrote:\s*/i,
    /\bEm\s.+?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s+escreveu:\s*/i,
    /\bOn\s.+?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s+wrote:\s*/i,
    /\bEm\s.+?escreveu:\s*/i,
    /\bOn\s.+?wrote:\s*/i,
  ];

  for (const marker of inlineMarkers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }

  return next
    .split('\n')
    .filter(line => {
      const normalized = line.trim();
      if (!normalized.startsWith('>')) return true;
      return false;
    })
    .join('\n')
    .trim();
}

export function stripSignature(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const markers = [
    /^\s*--\s*$/m,
    /^\s*__+\s*$/m,
    /^\s*Atenciosamente[,!.\s]*$/im,
    /^\s*Cordialmente[,!.\s]*$/im,
    /^\s*Abs[,!.\s]*$/im,
    /^\s*Assinatura[:\s]*$/im,
    /^\s*\[image:.*\]\s*$/im,
  ];

  let next = text;
  for (const marker of markers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }

  return next
    .split('\n')
    .filter(line => {
      const normalized = line.trim();
      if (!normalized) return true;
      if (/^\[image:.*\]$/i.test(normalized)) return false;
      if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(normalized)) return false;
      if (/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(normalized.replace(/\s+/g, ' '))) return false;
      if (/^(R\.|Av\.|Rua|Avenida)\s/i.test(normalized)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

// Ordem deliberada: encaminhamento primeiro (o corpo util esta DEPOIS do marcador),
// depois citacao/assinatura. Cada candidato (texto puro, depois HTML) so e
// descartado se a limpeza nao sobrar nada — melhor devolver sujo que vazio.
export function extractInboundMessageBody(textValue, htmlValue) {
  const candidates = [String(textValue || '').trim(), stripHtml(htmlValue)].filter(Boolean);
  for (const candidate of candidates) {
    const forwarded = extractForwardedMessageBody(candidate);
    if (forwarded) {
      const cleanedForwarded = stripSignature(forwarded);
      if (cleanedForwarded) return cleanedForwarded;
      if (forwarded) return forwarded;
    }
    const stripped = stripSignature(stripQuotedReply(candidate));
    if (stripped) return stripped;
    const plain = stripSignature(candidate);
    if (plain) return plain;
  }
  return '';
}
