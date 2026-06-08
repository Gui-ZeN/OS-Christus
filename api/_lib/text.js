// Helpers de texto compartilhados pelo backend (antes duplicados em vários handlers).

/** Slug para ids/chaves: minúsculo, só alfanumérico, hifens. */
export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slug para nomes de arquivo: preserva caixa, ponto, hífen e underscore. */
export function slugFilename(value) {
  return String(value || 'arquivo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Chave normalizada para comparação (sem acento, trim, minúsculo). */
export function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Divide um array em blocos de `size` (default 10, ex.: limite do `in` do Firestore). */
export function chunkValues(values, size = 10) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

const LIKELY_MOJIBAKE_REGEX = /(?:Ã.|Â.|â.|ð.|ï¿½|�)/g;
const LIKELY_MOJIBAKE_TEST_REGEX = /(?:Ã.|Â.|â.|ð.|ï¿½|�)/;

export function mojibakeScore(input) {
  const matches = String(input || '').match(LIKELY_MOJIBAKE_REGEX);
  return matches ? matches.length : 0;
}

/** Recupera texto com dupla codificação (UTF-8 lido como Latin-1). */
export function repairMojibake(value) {
  const input = String(value || '');
  if (!input || !LIKELY_MOJIBAKE_TEST_REGEX.test(input)) {
    return input;
  }

  try {
    let current = input;
    let currentScore = mojibakeScore(current);

    for (let index = 0; index < 3; index += 1) {
      const repaired = Buffer.from(current, 'latin1').toString('utf8');
      if (!repaired || repaired.includes('�')) break;

      const repairedScore = mojibakeScore(repaired);
      if (repairedScore >= currentScore) break;

      current = repaired;
      currentScore = repairedScore;
      if (currentScore === 0) break;
    }

    return current;
  } catch {
    return input;
  }
}
