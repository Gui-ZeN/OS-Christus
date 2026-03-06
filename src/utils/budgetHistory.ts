import { subMonths } from 'date-fns';
import type { Quote, QuoteItem, Ticket } from '../types';
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

export interface BudgetHistoryItemReference {
  key: string;
  label: string;
  unit: string | null;
  materialName: string | null;
  sampleCount: number;
  averageUnitPrice: number | null;
  averageUnitPriceLabel: string | null;
  minUnitPrice: number | null;
  minUnitPriceLabel: string | null;
  maxUnitPrice: number | null;
  maxUnitPriceLabel: string | null;
  latestUnitPrice: number | null;
  latestUnitPriceLabel: string | null;
  latestVendor: string | null;
}

export interface BudgetHistoryPreferredVendor {
  vendor: string;
  occurrenceCount: number;
  averageComparableValue: number | null;
  averageComparableValueLabel: string | null;
  latestComparableValue: number | null;
  latestComparableValueLabel: string | null;
  latestComparableDate: Date | null;
  rationale: string[];
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
  preferredVendor: BudgetHistoryPreferredVendor | null;
  itemReferences: BudgetHistoryItemReference[];
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

function getItemReferenceKey(item: QuoteItem) {
  const source = item.materialId || item.materialName || item.description;
  return normalizeText(String(source || '').trim());
}

function getItemReferenceLabel(item: QuoteItem) {
  return String(item.materialName || item.description || 'Item sem descrição').trim();
}

function getItemUnitPrice(item: QuoteItem) {
  const explicitUnitPrice = parseCurrency(item.unitPrice || '');
  if (explicitUnitPrice !== null) return explicitUnitPrice;

  const quantity = item.quantity ?? null;
  const totalPrice = parseCurrency(item.totalPrice || '');
  if (quantity && quantity > 0 && totalPrice !== null) {
    return totalPrice / quantity;
  }

  return null;
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
        preferredVendor: null,
        itemReferences: [],
      };
  }

  const cutoffDate = subMonths(new Date(), 24);
  const currentKeywords = extractKeywords(currentTicket);
  const currentKeywordSet = new Set(currentKeywords);

  const comparableEntries = tickets
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
        representativeQuote: representative,
      };
    })
    .filter(
      (
        value
      ): value is BudgetHistoryCase & {
        representativeQuote: Quote;
      } => value !== null
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.date.getTime() - a.date.getTime();
    });

  const similarCases = comparableEntries
    .map(({ representativeQuote: _representativeQuote, ...rest }) => rest)
    .slice(0, 5);

  const quoteValues = similarCases.map(item => item.value);
  const averageQuoteValue = quoteValues.length > 0 ? quoteValues.reduce((sum, value) => sum + value, 0) / quoteValues.length : null;
  const latestComparable = [...similarCases].sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;

  const vendorStats = new Map<
    string,
    {
      vendor: string;
      count: number;
      totalValue: number;
      latestDate: Date | null;
      latestValue: number | null;
      serviceMatches: number;
      macroMatches: number;
    }
  >();

  const currentServiceId = currentTicket.serviceCatalogId || '';
  const currentMacroId = currentTicket.macroServiceId || '';

  const itemStats = new Map<
    string,
    {
      key: string;
      label: string;
      unit: string | null;
      materialName: string | null;
      count: number;
      prices: number[];
      latestDate: Date | null;
      latestPrice: number | null;
      latestVendor: string | null;
    }
  >();

  comparableEntries.forEach(entry => {
    const vendorKey = normalizeText(entry.vendor);
    const existingVendor = vendorStats.get(vendorKey) ?? {
      vendor: entry.vendor,
      count: 0,
      totalValue: 0,
      latestDate: null,
      latestValue: null,
      serviceMatches: 0,
      macroMatches: 0,
    };
    existingVendor.count += 1;
    existingVendor.totalValue += entry.value;
    if (!existingVendor.latestDate || entry.date > existingVendor.latestDate) {
      existingVendor.latestDate = entry.date;
      existingVendor.latestValue = entry.value;
    }
    const quoteClassification = entry.representativeQuote.classification;
    if (
      currentServiceId &&
      quoteClassification?.serviceCatalogId &&
      quoteClassification.serviceCatalogId === currentServiceId
    ) {
      existingVendor.serviceMatches += 1;
    }
    if (
      currentMacroId &&
      quoteClassification?.macroServiceId &&
      quoteClassification.macroServiceId === currentMacroId
    ) {
      existingVendor.macroMatches += 1;
    }
    vendorStats.set(vendorKey, existingVendor);

    (entry.representativeQuote.items ?? []).forEach(item => {
      const key = getItemReferenceKey(item);
      if (!key) return;
      const unitPrice = getItemUnitPrice(item);
      if (unitPrice === null) return;

      const existingItem = itemStats.get(key) ?? {
        key,
        label: getItemReferenceLabel(item),
        unit: item.unit || null,
        materialName: item.materialName || null,
        count: 0,
        prices: [],
        latestDate: null,
        latestPrice: null,
        latestVendor: null,
      };
      existingItem.count += 1;
      existingItem.prices.push(unitPrice);
      if (!existingItem.latestDate || entry.date > existingItem.latestDate) {
        existingItem.latestDate = entry.date;
        existingItem.latestPrice = unitPrice;
        existingItem.latestVendor = entry.vendor;
      }
      itemStats.set(key, existingItem);
    });
  });

  const preferredVendorEntry =
    [...vendorStats.values()]
      .sort((a, b) => {
        if (b.serviceMatches !== a.serviceMatches) return b.serviceMatches - a.serviceMatches;
        if (b.macroMatches !== a.macroMatches) return b.macroMatches - a.macroMatches;
        if (b.count !== a.count) return b.count - a.count;
        return (b.latestDate?.getTime() ?? 0) - (a.latestDate?.getTime() ?? 0);
      })[0] ?? null;

  const preferredVendor =
    preferredVendorEntry && preferredVendorEntry.count > 0
      ? {
          vendor: preferredVendorEntry.vendor,
          occurrenceCount: preferredVendorEntry.count,
          averageComparableValue:
            preferredVendorEntry.count > 0 ? preferredVendorEntry.totalValue / preferredVendorEntry.count : null,
          averageComparableValueLabel:
            preferredVendorEntry.count > 0
              ? formatCurrency(preferredVendorEntry.totalValue / preferredVendorEntry.count)
              : null,
          latestComparableValue: preferredVendorEntry.latestValue,
          latestComparableValueLabel: formatCurrency(preferredVendorEntry.latestValue),
          latestComparableDate: preferredVendorEntry.latestDate,
          rationale: [
            preferredVendorEntry.serviceMatches > 0
              ? `${preferredVendorEntry.serviceMatches} comparações com o mesmo serviço`
              : null,
            preferredVendorEntry.macroMatches > 0
              ? `${preferredVendorEntry.macroMatches} comparações com o mesmo macroserviço`
              : null,
            `${preferredVendorEntry.count} ocorrências na base recente`,
          ].filter((value): value is string => Boolean(value)),
        }
      : null;

  const itemReferences = [...itemStats.values()]
    .map(item => {
      const average = item.prices.length > 0 ? item.prices.reduce((sum, price) => sum + price, 0) / item.prices.length : null;
      const min = item.prices.length > 0 ? Math.min(...item.prices) : null;
      const max = item.prices.length > 0 ? Math.max(...item.prices) : null;
      return {
        key: item.key,
        label: item.label,
        unit: item.unit,
        materialName: item.materialName,
        sampleCount: item.count,
        averageUnitPrice: average,
        averageUnitPriceLabel: formatCurrency(average),
        minUnitPrice: min,
        minUnitPriceLabel: formatCurrency(min),
        maxUnitPrice: max,
        maxUnitPriceLabel: formatCurrency(max),
        latestUnitPrice: item.latestPrice,
        latestUnitPriceLabel: formatCurrency(item.latestPrice),
        latestVendor: item.latestVendor,
      } satisfies BudgetHistoryItemReference;
    })
    .sort((a, b) => {
      if (b.sampleCount !== a.sampleCount) return b.sampleCount - a.sampleCount;
      return (b.averageUnitPrice ?? 0) - (a.averageUnitPrice ?? 0);
    })
    .slice(0, 6);

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
    preferredVendor,
    itemReferences,
  };
}

export function formatBudgetHistoryValue(value: number | null) {
  return formatCurrency(value) ?? '-';
}
