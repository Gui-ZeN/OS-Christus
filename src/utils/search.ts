/**
 * Casamento de busca para texto escrito por gente.
 *
 * A busca antiga era `alvo.includes(termo)`: exigia a frase inteira, colada, com os
 * mesmos acentos. O caso mais comum de todos era justamente o que falhava — quem
 * procura uma OS copia o título direto do Gmail, e o assunto GRAVADO não tem o `Re:`
 * nem o `[SEDE]`, que o parser de entrada remove ao criar a OS:
 *
 *   no Gmail:  Re: [SUL 3]-Solicitação de bancos para as recepções.
 *   na OS:     Solicitação de bancos para as recepções.
 *
 * Colar o título dava zero resultado, e a pessoa concluía que a OS não existia.
 *
 * Aqui o termo vira PALAVRAS e todas precisam aparecer, em qualquer ordem e sem
 * acento. Quem cola o título inteiro acha; quem lembra de duas palavras soltas
 * também.
 */

/** Sem acento, sem caixa: a chave de comparação de tudo aqui. */
export function normalizeSearchText(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Prefixos que a thread acumula e que não dizem nada sobre QUAL OS é. Ficam de fora
// do termo para não exigir que apareçam no alvo — nenhum assunto gravado os tem.
const REPLY_PREFIXES = /^\s*(?:(?:re|res|enc|fw|fwd)\s*:\s*)+/i;

/**
 * Quebra o que a pessoa digitou em palavras comparáveis. Pontuação e colchetes viram
 * separador: `[SUL 3]-Solicitação` produz `sul`, `3`, `solicitacao`.
 */
export function searchTokens(query?: string | null): string[] {
  let text = String(query || '');
  let previous = '';
  while (text && previous !== text) {
    previous = text;
    text = text.replace(REPLY_PREFIXES, '');
  }
  return normalizeSearchText(text)
    .split(/[^a-z0-9º°]+/)
    .filter(Boolean);
}

/**
 * `true` quando TODAS as palavras do termo aparecem no alvo. Termo vazio casa com
 * tudo — quem não digitou nada não está filtrando.
 */
export function matchesSearch(haystack: string, query?: string | null): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const target = normalizeSearchText(haystack);
  return tokens.every(token => target.includes(token));
}
