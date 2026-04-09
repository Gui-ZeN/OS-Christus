function decodeLikelyLatin1AsUtf8(input: string) {
  const bytes = Uint8Array.from(Array.from(input).map(char => char.charCodeAt(0) & 0xff));
  return new TextDecoder('utf-8').decode(bytes);
}

function mojibakeScore(input: string): number {
  const matches = input.match(/(?:Ã.|Â.|â.|ðŸ|ï¿½|�)/g);
  return matches ? matches.length : 0;
}

export function repairMojibake(value: unknown): string {
  const input = String(value ?? '');
  if (!input) return '';
  if (!/(?:Ã.|Â.|â.|ðŸ|ï¿½|�)/.test(input)) return input;

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
