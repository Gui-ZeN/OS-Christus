/**
 * Shared currency parsing and formatting utilities (pt-BR / BRL).
 * Import from here instead of duplicating these functions per-view.
 */

/** Parses a BRL-formatted string like "R$ 1.234,56" or "1234.56" to a number. */
export function parseCurrency(value: string | null | undefined): number {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    // Remove o ponto SÓ quando é separador de milhar (seguido de exatamente 3
    // dígitos e então fim/não-dígito). Assim "1.234,56"→1234.56 e "1234.56"→1234.56.
    // O antigo `.replace(/\./g,'')` transformava "1234.56" (colado de planilha/US)
    // em 123456 — cem vezes maior, indo pra aprovação da diretoria inflado.
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Formats a number as "R$ 1.234,56". */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

/** Converts a raw user-typed string to a displayable currency string, or '' if zero/invalid. */
export function normalizeCurrencyInput(value: string): string {
  const parsed = parseCurrency(value);
  return parsed > 0 ? formatCurrency(parsed) : '';
}

/** Strips everything except digits, commas, dots, and hyphens — safe for mid-typing. */
export function sanitizeCurrencyTypingInput(value: string): string {
  return String(value || '').replace(/[^\d,.-]/g, '');
}
