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
 * O marcador de sede que a thread carrega: `[SUL 3]`, `[JV]`, `[PQL 01]`.
 *
 * ⚠️ ELE NÃO EXISTE EM CAMPO NENHUM DA OS, então exigi-lo só esconde. Os testes
 * antigos não pegavam isso porque em todos eles a sigla entre colchetes era a MESMA
 * que ficava gravada na sede — aí cobrar a palavra saía de graça.
 *
 * Produção não respeita essa coincidência. Medido em 22/09/2026: **84 das 275
 * threads** com `[tag]` no assunto trazem uma tag que não bate com a sede gravada —
 * "PRÉ SUL" para PSUL, "DT1" para DT, "PQL 01" para PQL1. O caso que motivou:
 * OS-0320, assunto "Re: [JV] - Instalação de shafts de aluminio." e sede **PJF**
 * (`JV` é outra sede, José Vilar). Colar o título exigia `jv` e devolvia zero, com
 * três pessoas concluindo por e-mail que a OS não estava no sistema.
 *
 * Só o marcador do COMEÇO sai — no meio do termo, colchete é texto do assunto.
 */
const SEDE_TAG = /^\s*\[[^\]]{1,20}\]\s*[-–—:]*\s*/;

/**
 * Quebra o que a pessoa digitou em palavras comparáveis. Pontuação e colchetes viram
 * separador: `[SUL 3]-Solicitação` produz `sul`, `3`, `solicitacao`.
 */
export function searchTokens(query?: string | null): string[] {
  let text = String(query || '');
  let previous = '';
  while (text && previous !== text) {
    previous = text;
    text = text.replace(REPLY_PREFIXES, '').replace(SEDE_TAG, '');
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
