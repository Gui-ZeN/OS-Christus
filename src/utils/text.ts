function decodeLikelyLatin1AsUtf8(input: string) {
  const bytes = Uint8Array.from(Array.from(input).map(char => char.charCodeAt(0) & 0xff));
  return new TextDecoder('utf-8').decode(bytes);
}

export function repairMojibake(value: unknown): string {
  const input = String(value ?? '');
  if (!input) return '';
  if (!/[ÃÂâ][\s\S]?/.test(input)) return input;

  try {
    const repaired = decodeLikelyLatin1AsUtf8(input);
    if (!repaired || repaired.includes('\uFFFD')) return input;
    return repaired;
  } catch {
    return input;
  }
}
