import type { Quote } from '../../types';

// Lógica de rodadas de cotação (inicial/aditiva) — extraída do InboxView.

export function getAvailableAdditiveRounds(quotes: Quote[]) {
  return Array.from(
    new Set(
      (Array.isArray(quotes) ? quotes : [])
        .filter(quote => quote.category === 'additive')
        .map(quote => Number(quote.additiveIndex || 0))
        .filter(value => Number.isFinite(value) && value > 0)
    )
  ).sort((a, b) => a - b);
}

export function getAvailableInitialRounds(quotes: Quote[]) {
  return Array.from(
    new Set(
      (Array.isArray(quotes) ? quotes : [])
        .filter(quote => (quote.category === 'additive' ? 'additive' : 'initial') === 'initial')
        .map(quote => Number(quote.initialRoundIndex || 1))
        .filter(value => Number.isFinite(value) && value > 0)
    )
  ).sort((a, b) => a - b);
}

export function normalizeQuoteStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isRejectedQuoteRound(quotes: Quote[]) {
  return quotes.length > 0 && quotes.every(quote => normalizeQuoteStatus(quote.status) === 'rejected');
}

export function getEditableInitialRoundIndex(quotes: Quote[]) {
  const initialRounds = getAvailableInitialRounds(quotes);
  if (initialRounds.length === 0) return 1;
  const latestRound = Math.max(...initialRounds);
  const latestRoundQuotes = getQuotesByRound(quotes, 'initial', latestRound);
  return isRejectedQuoteRound(latestRoundQuotes) ? latestRound + 1 : latestRound;
}

export function getQuotesByRound(quotes: Quote[], roundType: 'initial' | 'additive', roundIndex: number) {
  const list = Array.isArray(quotes) ? quotes : [];
  const filtered = list.filter(quote => {
    const category = quote.category === 'additive' ? 'additive' : 'initial';
    if (roundType !== category) return false;
    if (roundType === 'additive') {
      return Number(quote.additiveIndex || 1) === Number(roundIndex || 1);
    }
    return Number(quote.initialRoundIndex || 1) === Number(roundIndex || 1);
  });

  return filtered.sort((a, b) => String(a.id).localeCompare(String(b.id), 'pt-BR'));
}
