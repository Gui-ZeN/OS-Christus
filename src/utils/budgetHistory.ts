import { subMonths } from 'date-fns';
import type { Quote, Ticket } from '../types';
import { coerceDate } from './date';

type QuoteMap = Record<string, Quote[]>;

const STOP_WORDS = new Set([
  'com',
  'para',
  'uma',
  'das',
  'dos',
  'por',
  'sem',
  'sob',
  'ate',
  'nos',
  'nas',
  'que',
  'ser',
  'em',
  'na',
  'no',
  'de',
  'do',
  'da',
  'e',
  'o',
  'a',
]);

export interface BudgetHistoryCase {
  ticketId: string;
  subject: string;
  date: Date;
  vendor: string;
  value: number;
  valueLabel: string;
  score: number;
  sharedTerms: string[];
  region: string;
  sede: string;
}

export interface BudgetHistorySummary {
  basisTerms: string[];
  similarCases: BudgetHistoryCase[];
  comparableTicketCount: number;
  comparableQuoteCount: number;
  averageQuoteValue: number | null;
  minQuoteValue: number | null;
  maxQuoteValue: number | null;
  latestComparableVendor: string | null;
  latestComparableValue: number | null;
  latestComparableValueLabel: string | null;
  latestComparableDate: Date | null;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractKeywords(ticket: Ticket) {
  const source = normalizeText(
    [
      ticket.type,
      ticket.subject,
      ticket.sector,
      ticket.macroServiceName,
      ticket.serviceCatalogName,
    ]
      .filter(Boolean)
      .join(' ')
  );
  return Array.from(
    new Set(
      source
        .split(/[^a-z0-9]+/)
        .map(part => part.trim())
        .filter(part => part.length >= 3 && !STOP_WORDS.has(part))
    )
  );
}

function parseCurrency(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function selectRepresentativeQuote(quotes: Quote[]) {
  const approved = quotes.find(quote => quote.status === 'approved');
  if (approved) return approved;

  const recommended = quotes.find(quote => quote.recommended);
  if (recommended) return recommended;

  return quotes
    .map(quote => ({ quote, numericValue: parseCurrency(quote.value) }))
    .filter(item => item.numericValue !== null)
    .sort((a, b) => (a.numericValue ?? 0) - (b.numericValue ?? 0))[0]?.quote ?? null;
}

export function buildBudgetHistorySummary(
  currentTicket: Ticket | null | undefined,
  tickets: Ticket[],
  quotesByTicket: QuoteMap
): BudgetHistorySummary {
  if (!currentTicket) {
    return {
      basisTerms: [],
      similarCases: [],
      comparableTicketCount: 0,
      comparableQuoteCount: 0,
      averageQuoteValue: null,
      minQuoteValue: null,
      maxQuoteValue: null,
      latestComparableVendor: null,
      latestComparableValue: null,
      latestComparableValueLabel: null,
      latestComparableDate: null,
    };
  }

  const cutoffDate = subMonths(new Date(), 24);
  const currentKeywords = extractKeywords(currentTicket);
  const currentKeywordSet = new Set(currentKeywords);

  const similarCases = tickets
    .filter(ticket => ticket.id !== currentTicket.id)
    .map(ticket => {
      const ticketDate = coerceDate(ticket.time, new Date(NaN));
      if (Number.isNaN(ticketDate.getTime()) || ticketDate < cutoffDate) return null;

      const candidateQuotes = quotesByTicket[ticket.id] ?? [];
      if (candidateQuotes.length === 0) return null;

      const candidateKeywords = extractKeywords(ticket);
      const sharedTerms = candidateKeywords.filter(term => currentKeywordSet.has(term));
      const sameType = normalizeText(ticket.type) === normalizeText(currentTicket.type);
      const sameMacroService =
        (ticket.macroServiceId && currentTicket.macroServiceId && ticket.macroServiceId === currentTicket.macroServiceId) ||
        normalizeText(ticket.macroServiceName || '') === normalizeText(currentTicket.macroServiceName || '');
      const sameService =
        (ticket.serviceCatalogId && currentTicket.serviceCatalogId && ticket.serviceCatalogId === currentTicket.serviceCatalogId) ||
        normalizeText(ticket.serviceCatalogName || '') === normalizeText(currentTicket.serviceCatalogName || '');
      const sameSector = normalizeText(ticket.sector) === normalizeText(currentTicket.sector);
      const sameRegion =
        (ticket.regionId && currentTicket.regionId && ticket.regionId === currentTicket.regionId) ||
        normalizeText(ticket.region) === normalizeText(currentTicket.region);
      const sameSite =
        (ticket.siteId && currentTicket.siteId && ticket.siteId === currentTicket.siteId) ||
        normalizeText(ticket.sede) === normalizeText(currentTicket.sede);
      const score =
        sharedTerms.length +
        (sameType ? 3 : 0) +
        (sameMacroService ? 4 : 0) +
        (sameService ? 5 : 0) +
        (sameSector ? 2 : 0) +
        (sameRegion ? 1 : 0) +
        (sameSite ? 1 : 0);

      if (score < 3 && sharedTerms.length === 0) return null;

      const representative = selectRepresentativeQuote(candidateQuotes);
      if (!representative) return null;

      const numericValue = parseCurrency(representative.value);
      if (numericValue === null) return null;

      return {
        ticketId: ticket.id,
        subject: ticket.subject,
        date: ticketDate,
        vendor: representative.vendor,
        value: numericValue,
        valueLabel: formatCurrency(numericValue) ?? representative.value,
        score,
        sharedTerms: sharedTerms.slice(0, 4),
        region: ticket.region,
        sede: ticket.sede,
      } satisfies BudgetHistoryCase;
    })
    .filter((value): value is BudgetHistoryCase => value !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.date.getTime() - a.date.getTime();
    })
    .slice(0, 5);

  const quoteValues = similarCases.map(item => item.value);
  const averageQuoteValue = quoteValues.length > 0 ? quoteValues.reduce((sum, value) => sum + value, 0) / quoteValues.length : null;
  const latestComparable = [...similarCases].sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;

  return {
    basisTerms: currentKeywords.slice(0, 6),
    similarCases,
    comparableTicketCount: similarCases.length,
    comparableQuoteCount: quoteValues.length,
    averageQuoteValue,
    minQuoteValue: quoteValues.length > 0 ? Math.min(...quoteValues) : null,
    maxQuoteValue: quoteValues.length > 0 ? Math.max(...quoteValues) : null,
    latestComparableVendor: latestComparable?.vendor ?? null,
    latestComparableValue: latestComparable?.value ?? null,
    latestComparableValueLabel: latestComparable ? formatCurrency(latestComparable.value) : null,
    latestComparableDate: latestComparable?.date ?? null,
  };
}

export function formatBudgetHistoryValue(value: number | null) {
  return formatCurrency(value) ?? '-';
}
