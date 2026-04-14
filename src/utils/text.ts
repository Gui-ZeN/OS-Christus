function decodeLikelyLatin1AsUtf8(input: string) {
  const bytes = Uint8Array.from(Array.from(input).map(char => char.charCodeAt(0) & 0xff));
  return new TextDecoder('utf-8').decode(bytes);
}

const LIKELY_MOJIBAKE_REGEX = /(?:Ã.|Â.|â.|ð.|ï¿½|�)/g;
const LIKELY_MOJIBAKE_TEST_REGEX = /(?:Ã.|Â.|â.|ð.|ï¿½|�)/;

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
