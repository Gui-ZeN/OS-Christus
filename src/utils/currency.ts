/**
 * Shared currency parsing and formatting utilities (pt-BR / BRL).
 * Import from here instead of duplicating these functions per-view.
 */

/** Parses a BRL-formatted string like "R$ 1.234,56" or "1234.56" to a number. */
export function parseCurrency(value: string | null | undefined): number {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
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
