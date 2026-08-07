// Helpers de e-mail compartilhados pelo backend (antes duplicados em vários arquivos).

/** Extrai o primeiro e-mail válido de um texto, em minúsculas, ou null. */
export function firstEmail(raw) {
  if (!raw) return null;
  const match = String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Lista de e-mails únicos a partir de string ou array.
 * Por padrão divide só em `,`/`;` (comportamento de envio). Use
 * `{ splitWhitespace: true }` para também dividir por espaços (formulários).
 */
export function parseEmailList(input, { splitWhitespace = false } = {}) {
  if (!input) return [];
  const splitter = splitWhitespace ? /[;,\s]+/ : /[;,]+/;
  const values = Array.isArray(input) ? input : String(input).split(splitter);
  return [...new Set(values.map(firstEmail).filter(Boolean))];
}

/** Validação de formato de e-mail (TLD com 2+ caracteres). */
export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

/** Junta listas de e-mail (string ou array) numa lista única, sem repetir. */
export function mergeEmailLists(...inputs) {
  return [...new Set(inputs.flatMap(input => parseEmailList(input)))];
}

/**
 * Tira da lista de cópia quem não deve receber: as caixas do próprio sistema e quem
 * já é destinatário direto.
 *
 * É o filtro que decide o volume de e-mail que a operação recebe. Vivia dentro das
 * 2.5 mil linhas do mail.js, sem teste, dependendo de env para rodar — aqui é uma
 * função pura, e quem chama passa a lista de bloqueados.
 */
export function filterCopyRecipients(input, blocked = []) {
  const bloqueados = new Set(
    blocked
      .map(value => firstEmail(value) || String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );
  return parseEmailList(input).filter(email => !bloqueados.has(email));
}
