import type { QuoteItem } from '../../types';

/**
 * Tipos compartilhados da decomposição do modal de Cotações (InboxView →
 * componentes em `inbox/`). Lar neutro pra evitar import circular ou drift de
 * tipos duplicados entre a InboxView e os cards/painéis extraídos.
 */

/** Rascunho de cotação editável no modal (sem `id`/`recommended` do `Quote` persistido). */
export type QuoteDraft = {
  vendor: string;
  value: string;
  laborValue?: string;
  materialValue?: string;
  totalValue?: string;
  items: QuoteItem[];
};

/** Cabeçalho/contexto da rodada de cotações (unidade, local, pasta, etc.). */
export type ProposalHeaderDraft = {
  unitName: string;
  location: string;
  folderLink: string;
  contractedVendor: string;
  totalQuantity: string;
  totalEstimatedValue: string;
};

/** Seção do comparativo consolidado (linhas agrupadas por seção, valores por fornecedor). */
export type QuoteComparisonSection = {
  key: string;
  label: string;
  rows: Array<{
    key: string;
    description: string;
    unit: string;
    quantity: string;
    values: Array<{ costUnitPrice: string; chargedTotalPrice: string }>;
  }>;
};
