import { buildBudgetHistorySummary } from '../../utils/budgetHistory';
import type { CatalogVendorPreference } from '../../services/catalogApi';
import type { QuoteDraft } from './types';
import { useQuoteEditorContext } from './QuoteEditorContext';

type PreferredVendor = ReturnType<typeof buildBudgetHistorySummary>['preferredVendor'];

interface QuoteVendorFieldsProps {
  quote: QuoteDraft;
  i: number;
  persistedServicePreference: CatalogVendorPreference | null;
  preferredVendor: PreferredVendor;
}

/**
 * Campos do topo de um card de fornecedor (Fornecedor, Valor total, e os
 * resumos Material/Mão de obra/Total da obra) + dica de fornecedor preferencial.
 * Sub-mordida do editor núcleo de Cotações. Controlado pelo pai via props.
 */
export function QuoteVendorFields({ quote, i, persistedServicePreference, preferredVendor }: QuoteVendorFieldsProps) {
  const { handleQuoteChange, handleQuoteCurrencyBlur } = useQuoteEditorContext();
  return (
    <div className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]">
              <div className="min-w-0">
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Fornecedor</label>
                <input
                  type="text"
                  placeholder="Nome da Empresa"
                  value={quote.vendor}
                  onChange={e => handleQuoteChange(i, 'vendor', e.target.value)}
                  className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                />
                {(persistedServicePreference || preferredVendor) && quote.vendor.trim() && (
                  <div className={`mt-1 truncate text-[11px] ${quote.vendor.trim().toLowerCase() === String((persistedServicePreference || preferredVendor)?.vendor || '').trim().toLowerCase() ? 'text-emerald-700' : 'text-roman-text-sub'}`}>
                    {quote.vendor.trim().toLowerCase() === String((persistedServicePreference || preferredVendor)?.vendor || '').trim().toLowerCase()
                      ? persistedServicePreference
                        ? 'Coincide com o fornecedor persistido para este serviço.'
                        : 'Coincide com o fornecedor preferencial da base histórica.'
                      : `Preferência atual: ${(persistedServicePreference || preferredVendor)?.vendor}`}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor total</label>
                <input
                  type="text"
                  placeholder="R$ 0,00"
                  value={quote.value}
                  onChange={e => handleQuoteChange(i, 'value', e.target.value)}
                  onBlur={() => handleQuoteCurrencyBlur(i, 'value')}
                  className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                />
              </div>
              <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Material</div>
                <div className="mt-1 text-sm font-medium text-roman-text-main truncate">{quote.materialValue || '-'}</div>
              </div>
              <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Mão de obra</div>
                <div className="mt-1 text-sm font-medium text-roman-text-main truncate">{quote.laborValue || '-'}</div>
              </div>
              <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Total da obra</div>
                <div className="mt-1 text-sm font-semibold text-roman-text-main truncate">{quote.totalValue || quote.value || '-'}</div>
              </div>
            </div>
  );
}
