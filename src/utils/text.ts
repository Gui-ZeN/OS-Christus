/** Normaliza para comparação: sem acento, minúsculo. */
export function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function decodeLikelyLatin1AsUtf8(input: string) {
  const bytes = Uint8Array.from(Array.from(input).map(char => char.charCodeAt(0) & 0xff));
  return new TextDecoder('utf-8').decode(bytes);
}

const LIKELY_MOJIBAKE_REGEX = /(?:Ã.|Â.|â.|ð.|ï¿½|\uFFFD)/g;
const LIKELY_MOJIBAKE_TEST_REGEX = /(?:Ã.|Â.|â.|ð.|ï¿½|\uFFFD)/;

function mojibakeScore(input: string): number {
  const matches = input.match(LIKELY_MOJIBAKE_REGEX);
  return matches ? matches.length : 0;
}

export function repairMojibake(value: unknown): string {
  const input = String(value ?? '');
  if (!input) return '';
  if (!LIKELY_MOJIBAKE_TEST_REGEX.test(input)) return input;

  try {
    let current = input;
    let currentScore = mojibakeScore(current);

    for (let index = 0; index < 3; index += 1) {
      const decoded = decodeLikelyLatin1AsUtf8(current);
      if (!decoded || decoded.includes('\uFFFD')) break;

      const decodedScore = mojibakeScore(decoded);
      if (decodedScore >= currentScore) break;

      current = decoded;
      currentScore = decodedScore;
      if (currentScore === 0) break;
    }

    return current;
  } catch {
    return input;
  }
}

export function stripAttachmentLinksFromMessage(value: unknown): string {
  const text = repairMojibake(value);
  if (!text) return '';

  const marker = 'anexos enviados:';
  const markerIndex = text.toLowerCase().indexOf(marker);
  if (markerIndex === -1) return text.trim();

  return text.slice(0, markerIndex).trim();
}

export function cleanForwardedMessageText(value: unknown): string {
  const text = stripAttachmentLinksFromMessage(value);
  if (!text) return '';

  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line =>
      line
        .replace(/^\s*>[>\s]*/, '')          // marcadores de citação ">" no início (inclui ">> aninhado")
        .replace(/\[image:[^\]]*\]/gi, '')   // placeholders de imagem inline ([image: foo.gif])
        .replace(/[ \t]{2,}/g, ' ')          // colapsa espaços repetidos
        .trim()
    );

  const cleaned = lines.filter(line => {
    const normalized = line.toLowerCase();
    if (!line) return false;
    if (normalized === 'forwarded message' || normalized === 'mensagem encaminhada') return false;
    if (/forwarded conversation/i.test(line)) return false;            // "---- Forwarded Conversation ----"
    if (/^[-_=*~]{3,}.*[-_=*~]{3,}$/.test(line)) return false;          // divisórias "---------- x ----------"
    if (/^[-_=*~]{2,}$/.test(line)) return false;                       // separadores só de traços ("--", "___")
    if (/^(from|de|to|para|subject|assunto|date|data|cc|cco|enviado|sent)\s*:/i.test(line)) return false;
    if ((line.match(/@[\w.-]+/g) || []).length >= 3) return false;      // linha que é lista de destinatários
    return true;
  });

  const compact = cleaned.join('\n').replace(/(?:\n\s*){3,}/g, '\n\n').trim();
  return compact || text;
}

/**
 * Separa a mensagem mais recente do histórico citado (respostas/encaminhamentos
 * anteriores). O corte é a primeira linha citada (">") ou a primeira atribuição
 * de resposta ("Em <data> Fulano escreveu:"). Cada parte é limpa por
 * cleanForwardedMessageText. Sem citação, `quoted` vem vazio.
 */
export function splitMessageQuote(value: unknown): { latest: string; quoted: string } {
  const text = String(value ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) return { latest: '', quoted: '' };

  const lines = text.split('\n');
  let boundary = lines.findIndex(line => /^\s*>/.test(line));
  const attribution = lines.findIndex(line => /^\s*(Em|On)\s+.+(escreveu|wrote)\s*:?\s*$/i.test(line));
  if (attribution !== -1 && (boundary === -1 || attribution < boundary)) {
    boundary = attribution;
  }

  if (boundary === -1) {
    return { latest: cleanForwardedMessageText(text), quoted: '' };
  }

  const latest = cleanForwardedMessageText(lines.slice(0, boundary).join('\n'))
    // remove uma atribuição "Em ... escreveu:" que tenha sobrado no fim do trecho.
    .replace(/\n?\s*(Em|On)\s+.+(escreveu|wrote)\s*:?\s*$/i, '')
    .trim();
  const quoted = cleanForwardedMessageText(lines.slice(boundary).join('\n'));
  return { latest, quoted };
}
