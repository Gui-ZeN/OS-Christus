/**
 * Destinatários digitados à mão na Inbox.
 *
 * Vivia solto dentro da InboxView, sem teste — e é o caminho por onde um e-mail de OS
 * sai (ou deixa de sair) para quem precisa receber. Errar aqui é silencioso: o
 * endereço torto some da lista e ninguém percebe até cobrarem a resposta.
 */

export interface ParsedEmailTokens {
  valid: string[];
  invalid: string[];
}

/**
 * Quebra um campo livre em endereços válidos e inválidos.
 *
 * Separadores: vírgula, ponto e vírgula e espaço — porque é assim que as pessoas
 * colam de outros e-mails. O que não parece endereço volta em `invalid` em vez de ser
 * descartado: quem digitou precisa ver o próprio erro.
 */
export function parseEmailTokens(input: string): ParsedEmailTokens {
  const valid: string[] = [];
  const invalid: string[] = [];
  String(input || '')
    .split(/[;,\s]+/)
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .forEach(value => {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        if (!valid.includes(value)) valid.push(value);
      } else if (!invalid.includes(value)) {
        invalid.push(value);
      }
    });
  return { valid, invalid };
}

/**
 * Junta listas de e-mail sem repetir. Compara em minúsculas: o mesmo endereço com
 * caixa diferente é a mesma pessoa, e mandar duas vezes é o que faz o sistema parecer
 * que spamma.
 */
export function mergeEmails(...groups: Array<string[] | undefined>): string[] {
  return [
    ...new Set(
      groups
        .flatMap(group => group || [])
        .map(email => String(email || '').trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

/**
 * Chave de comparação para texto escrito por gente: sem acento, sem caixa, sem sobra
 * nas pontas. Usada para casar local ("Bloco A" × "bloco a") e etiqueta de terceiro.
 */
export function normalizeForMatching(value?: string | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
