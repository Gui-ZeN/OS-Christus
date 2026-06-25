import type { CatalogMaterial } from '../../services/catalogApi';
import { buildBudgetHistorySummary } from '../../utils/budgetHistory';
import type { QuoteDraft } from './types';
import { CUSTOM_QUOTE_UNIT_VALUE, buildQuoteItemUnitKey, normalizeUnitAbbreviation } from './quotes';
import { QuoteItemRow } from './QuoteItemRow';
import { useQuoteEditorContext } from './QuoteEditorContext';

type ItemReferences = ReturnType<typeof buildBudgetHistorySummary>['itemReferences'];

interface QuoteItemsSectionProps {
  quote: QuoteDraft;
  i: number;
  suggestedQuoteMaterials: CatalogMaterial[];
  itemReferences: ItemReferences;
}

/**
 * Seção "Itens do orçamento" de um card de fornecedor: botões +1/+5, materiais
 * sugeridos, cabeçalho da tabela e a lista de itens (cada um via <QuoteItemRow>).
 * Última sub-mordida do editor núcleo — fecha a decomposição do card. Os locais
 * calculados por item (reference, itemUnitKey, etc.) ficam aqui, no map.
 */
export function QuoteItemsSection({ quote, i, suggestedQuoteMaterials, itemReferences }: QuoteItemsSectionProps) {
  const {
    pendingCustomUnitByItem, setPendingCustomUnitByItem, quoteUnitOptions,
    handleAddQuoteItem, handleAddMultipleQuoteItems, handleQuoteItemChange,
    handleRemoveQuoteItem, handleQuoteItemUnitSelect, handleQuoteItemCurrencyBlur,
    handleQuoteItemCustomUnitSave,
  } = useQuoteEditorContext();
  return (
    <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">
                  Itens do orçamento ({quote.items.length})
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddMultipleQuoteItems(i, 5)}
                    className="text-[11px] font-medium text-roman-primary hover:underline"
                  >
                    +5 itens
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddQuoteItem(i)}
                    className="text-[11px] font-medium text-roman-primary hover:underline"
                  >
                    +1 item
                  </button>
                </div>
              </div>

              {suggestedQuoteMaterials.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {suggestedQuoteMaterials.slice(0, 4).map(material => (
                    <button
                      key={`${i}-${material.id}`}
                      type="button"
                      onClick={() => {
                        const targetItem = quote.items[quote.items.length - 1];
                        if (!targetItem) return;
                        handleQuoteItemChange(i, targetItem.id, 'materialName', material.name);
                        if (material.unit) {
                          handleQuoteItemChange(i, targetItem.id, 'unit', material.unit);
                        }
                      }}
                      className="rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-2 py-1 text-[11px] text-roman-primary"
                    >
                      {material.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="hidden lg:grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_100px_130px_150px_150px_88px] gap-2 px-2 pb-2 text-[10px] uppercase tracking-widest text-roman-text-sub">
                <span>Tipo</span>
                <span>Material</span>
                <span>Descrição</span>
                <span>Qtd.</span>
                <span>Unidade</span>
                <span>Custo unitário</span>
                <span>Total</span>
                <span className="text-right">Ação</span>
              </div>

              <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {quote.items.map((item, itemIndex) => {
                  const itemKey = String(item.materialId || item.materialName || item.description || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .trim();
                  const reference = itemReferences.find(entry => entry.key === itemKey);
                  const itemUnitKey = buildQuoteItemUnitKey(i, item.id);
                  const hasCustomUnitInput = Object.prototype.hasOwnProperty.call(pendingCustomUnitByItem, itemUnitKey);
                  const selectedUnitValue = hasCustomUnitInput
                    ? CUSTOM_QUOTE_UNIT_VALUE
                    : normalizeUnitAbbreviation(item.unit) || '';

                  return (
                    <QuoteItemRow key={item.id} item={item} itemIndex={itemIndex} i={i} reference={reference} selectedUnitValue={selectedUnitValue} hasCustomUnitInput={hasCustomUnitInput} itemUnitKey={itemUnitKey} />
                  );
                })}
              </div>
            </div>
  );
}
