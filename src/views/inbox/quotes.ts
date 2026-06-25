/**
 * Helpers e constantes compartilhados da edição de Cotações (InboxView →
 * componentes em `inbox/`). Fonte única pra evitar drift — especialmente da
 * taxonomia de seções, que precisa bater entre o editor e o comparativo.
 */
import { formatCurrency as formatCurrencyInput, parseCurrency as parseCurrencyInput } from '../../utils/currency';
import type { QuoteItem, Ticket } from '../../types';
import type { ProposalHeaderDraft, QuoteDraft } from './types';

/** Sentinela do <option> "+ Outra..." no seletor de unidade do item. */
export const CUSTOM_QUOTE_UNIT_VALUE = '__custom_unit__';

/** Opções de seção de um item de cotação (taxonomia fixa do negócio). */
export const QUOTE_SECTION_OPTIONS = [
  { value: 'material', label: 'Material' },
  { value: 'mao-de-obra', label: 'Mão de obra' },
  { value: 'materiais-complementares', label: 'Materiais complementares' },
  { value: 'servicos-complementares', label: 'Serviços complementares' },
] as const;

/** Normaliza a seção do item (legado `material-mao-de-obra` vira `material`). */
export function normalizeQuoteSection(section?: string | null) {
  const normalized = String(section || '').trim();
  if (!normalized || normalized === 'material-mao-de-obra') return 'material';
  return normalized;
}

/** Normaliza a sigla de unidade (trim + maiúsculas). */
export function normalizeUnitAbbreviation(value?: string | null) {
  if (!value) return '';
  return value.trim().toUpperCase();
}

/** Chave estável de um item por (índice da cotação, id do item) — p/ estado de unidade custom. */
export function buildQuoteItemUnitKey(quoteIndex: number, itemId: string) {
  return `${quoteIndex}:${itemId}`;
}

/** Mínimo de slots de cotação numa rodada inicial. */
export const INITIAL_MIN_QUOTE_SLOTS = 2;

/** Item de cotação vazio (id novo, seção 'material'). */
export function createEmptyQuoteItem(defaultDescription = '', defaultUnit = ''): QuoteItem {
  return {
    id: crypto.randomUUID(),
    section: 'material',
    description: defaultDescription,
    materialId: null,
    materialName: null,
    unit: defaultUnit || null,
    quantity: null,
    costUnitPrice: null,
    unitPrice: null,
    totalPrice: null,
  };
}

/** Rascunho de cotação vazio (1 item). */
export function createEmptyQuoteDraft(): QuoteDraft {
  return {
    vendor: '',
    value: '',
    laborValue: '',
    materialValue: '',
    totalValue: '',
    items: [createEmptyQuoteItem()],
  };
}

/** Cabeçalho de proposta inicial (puxa a unidade do site/OS). */
export function createProposalHeaderDraft(ticket?: Ticket, siteLabel?: string): ProposalHeaderDraft {
  return {
    unitName: siteLabel || ticket?.sede || '',
    location: '',
    folderLink: '',
    contractedVendor: '',
    totalQuantity: '',
    totalEstimatedValue: '',
  };
}

/** Unidades padrão do seletor de unidade do item. */
export const DEFAULT_QUOTE_UNIT_OPTIONS = [
  'UN', 'PÇ', 'CX', 'PC', 'CT', 'PR', 'RL', 'DZ', 'GS', 'CENTO',
  'KG', 'G', 'SC60', 'L', 'ML', 'M3', 'M', 'CM', 'M2',
] as const;

/** Seções distintas presentes nos itens (default 'material' se vazio). */
export function getQuoteSections(items: QuoteItem[]) {
  const values = new Set<string>();
  for (const item of items) {
    values.add(normalizeQuoteSection(item.section));
  }
  if (values.size === 0) values.add('material');
  return Array.from(values);
}

/** Label de exibição de uma seção do item. */
export function getQuoteSectionLabel(section: string) {
  return QUOTE_SECTION_OPTIONS.find(option => option.value === section)?.label || section;
}

/** A seção é mão de obra / serviço (vs. material)? */
export function isLaborSection(section?: string | null) {
  const normalized = normalizeQuoteSection(section).toLowerCase();
  return normalized.includes('mao-de-obra') || normalized.includes('servico');
}

/** Breakdown labor/material/total de um rascunho de cotação (qtd×unitário, ou total da linha). */
export function summarizeQuoteDraft(draft: QuoteDraft) {
  const totals = draft.items.reduce(
    (acc, item) => {
      const quantity = item.quantity ?? 0;
      const costUnitPrice = item.costUnitPrice ? parseCurrencyInput(item.costUnitPrice) : 0;
      const lineTotal =
        quantity > 0 && costUnitPrice > 0
          ? quantity * costUnitPrice
          : parseCurrencyInput(item.totalPrice || '');
      if (lineTotal <= 0) return acc;
      if (isLaborSection(item.section)) {
        acc.labor += lineTotal;
      } else {
        acc.material += lineTotal;
      }
      return acc;
    },
    { labor: 0, material: 0 }
  );
  const total = totals.labor + totals.material;
  return {
    laborValue: totals.labor > 0 ? formatCurrencyInput(totals.labor) : '',
    materialValue: totals.material > 0 ? formatCurrencyInput(totals.material) : '',
    totalValue: total > 0 ? formatCurrencyInput(total) : '',
  };
}
