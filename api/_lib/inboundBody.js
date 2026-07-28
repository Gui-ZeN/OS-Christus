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

const EMAIL_TOKEN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * Linha que e so CONTINUACAO de uma lista de destinatarios: "Fulano <a@x>,
 * Beltrano <b@x>," — sem rotulo `Para:`, porque o cliente de e-mail quebrou a
 * lista em varias linhas. So `Para:` era removido; o resto da lista vazava para
 * dentro da OS junto com os enderecos de todo mundo.
 */
export function isRecipientContinuationLine(line) {
  const normalized = String(line || '').trim();
  if (!normalized || !EMAIL_TOKEN.test(normalized)) return false;
  // Tira nomes, enderecos e separadores: se nao sobrar praticamente nada, a linha
  // era so lista de destinatarios.
  const resto = normalized
    .replace(/<[^>]*>/g, ' ')
    .replace(new RegExp(EMAIL_TOKEN.source, 'gi'), ' ')
    .replace(/["',;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return resto.length <= 40;
}

/**
 * Remove o bloco de cabecalho do encaminhamento que sobrou no TOPO. Age so no
 * inicio e para na primeira linha de conteudo — assim um e-mail que legitimamente
 * cita enderecos no meio do texto nao perde nada.
 */
export function stripLeadingForwardHeader(value) {
  const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
  let pointer = 0;
  let removeu = false;
  while (pointer < lines.length) {
    const atual = lines[pointer].trim();
    if (!atual) {
      pointer += 1;
      continue;
    }
    if (isForwardHeaderLine(atual) || (removeu && isRecipientContinuationLine(atual))) {
      removeu = true;
      pointer += 1;
      continue;
    }
    break;
  }
  return removeu ? lines.slice(pointer).join('\n').trim() : String(value || '').trim();
}

// Rodape e cabecalho do e-mail que o PROPRIO Serv3 envia. Quando o solicitante
// responde ou encaminha mantendo a mensagem automatica, ela voltava inteira para
// o historico — com o layout HTML achatado em linhas soltas ("Serv3",
// "Recebimento", "Ticket", "Mensagem"...).
const SYSTEM_ECHO_MARKERS = [
  /^\s*Este é um comunicado automático do sistema Serv3\.?\s*$/im,
  /^\s*Link completo:\s*https?:\/\//im,
  /^\s*Acompanhar OS\s*<https?:\/\//im,
];

export function stripSystemEcho(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  let next = text;
  for (const marker of SYSTEM_ECHO_MARKERS) {
    const match = marker.exec(next);
    // Mesmo guard dos demais cortes: marcador na posicao 0 significa que a
    // mensagem inteira e o eco, e cortar deixaria a OS sem texto nenhum.
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
    }
  }
  return next;
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

  // A pontuacao aceita inclui `;` e `:` — "Abs;" e "Atenciosamente:" sao comuns e
  // escapavam do corte, arrastando junto TUDO que vinha depois da despedida
  // (assinatura, e-mail citado, rodape do sistema) para dentro da OS.
  const farewell = '[,;:!.\\s]*';
  const markers = [
    /^\s*--\s*$/m,
    /^\s*__+\s*$/m,
    new RegExp(`^\\s*Atenciosamente${farewell}$`, 'im'),
    new RegExp(`^\\s*Cordialmente${farewell}$`, 'im'),
    new RegExp(`^\\s*Abs${farewell}$`, 'im'),
    new RegExp(`^\\s*Abra[çc]os${farewell}$`, 'im'),
    new RegExp(`^\\s*Obrigad[oa]${farewell}$`, 'im'),
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
  for (const raw of candidates) {
    // Cabecalho de encaminhamento sobrando no topo sai antes de tudo: ele nao e
    // conteudo em nenhuma das ramificacoes abaixo.
    const candidate = stripLeadingForwardHeader(raw);

    const forwarded = extractForwardedMessageBody(candidate);
    if (forwarded) {
      const cleanedForwarded = stripSystemEcho(stripSignature(forwarded));
      if (cleanedForwarded) return cleanedForwarded;
      if (forwarded) return forwarded;
    }
    const stripped = stripSystemEcho(stripSignature(stripQuotedReply(candidate)));
    if (stripped) return stripped;
    const plain = stripSystemEcho(stripSignature(candidate));
    if (plain) return plain;
  }
  return '';
}
