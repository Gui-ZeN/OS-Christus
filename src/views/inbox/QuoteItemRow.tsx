import type { Dispatch, SetStateAction } from 'react';
import type { QuoteItem } from '../../types';
import { buildBudgetHistorySummary } from '../../utils/budgetHistory';
import { CUSTOM_QUOTE_UNIT_VALUE, QUOTE_SECTION_OPTIONS, normalizeQuoteSection } from './quotes';

type ItemReference = ReturnType<typeof buildBudgetHistorySummary>['itemReferences'][number];

interface QuoteItemRowProps {
  item: QuoteItem;
  itemIndex: number;
  i: number;
  reference: ItemReference | undefined;
  selectedUnitValue: string;
  hasCustomUnitInput: boolean;
  itemUnitKey: string;
  pendingCustomUnitByItem: Record<string, string>;
  setPendingCustomUnitByItem: Dispatch<SetStateAction<Record<string, string>>>;
  quoteUnitOptions: string[];
  handleQuoteItemChange: (quoteIndex: number, itemId: string, field: keyof QuoteItem, value: string | number | null) => void;
  handleRemoveQuoteItem: (quoteIndex: number, itemId: string) => void;
  handleQuoteItemUnitSelect: (quoteIndex: number, itemId: string, selectedValue: string) => void;
  handleQuoteItemCurrencyBlur: (quoteIndex: number, itemId: string, field: 'costUnitPrice') => void;
  handleQuoteItemCustomUnitSave: (quoteIndex: number, itemId: string) => void;
}

/**
 * Linha de um item de cotação (tipo/material/descrição/qtd/unidade/custo/total
 * + unidade custom + dica de histórico). Sub-mordida mais complexa do editor do
 * "elefante". Os locais calculados (reference, selectedUnitValue, itemUnitKey,
 * hasCustomUnitInput) ficam no pai e chegam por props (zero-rename).
 */
export function QuoteItemRow({
  item, itemIndex, i, reference, selectedUnitValue, hasCustomUnitInput, itemUnitKey,
  pendingCustomUnitByItem, setPendingCustomUnitByItem, quoteUnitOptions,
  handleQuoteItemChange, handleRemoveQuoteItem, handleQuoteItemUnitSelect,
  handleQuoteItemCurrencyBlur, handleQuoteItemCustomUnitSave,
}: QuoteItemRowProps) {
  return (
    <div className="rounded-sm border border-roman-border bg-roman-bg px-2 py-2">
                      <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
                        <div className="text-[11px] font-medium text-roman-text-main">Item {itemIndex + 1}</div>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuoteItem(i, item.id)}
                          className="text-[11px] text-red-700 hover:underline"
                        >
                          Remover
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_100px_130px_150px_150px_88px]">
                        <select
                          value={normalizeQuoteSection(item.section)}
                          onChange={event => handleQuoteItemChange(i, item.id, 'section', event.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        >
                          {QUOTE_SECTION_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Material"
                          value={item.materialName || ''}
                          onChange={event => handleQuoteItemChange(i, item.id, 'materialName', event.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                        <input
                          type="text"
                          placeholder="Descrição do item"
                          value={item.description}
                          onChange={event => handleQuoteItemChange(i, item.id, 'description', event.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Qtd."
                          value={item.quantity ?? ''}
                          onChange={event => handleQuoteItemChange(i, item.id, 'quantity', event.target.value ? Number(event.target.value) : null)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                        <select
                          value={selectedUnitValue}
                          onChange={event => handleQuoteItemUnitSelect(i, item.id, event.target.value)}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        >
                          <option value="">Unidade</option>
                          {quoteUnitOptions.map(unit => (
                            <option key={`unit-${unit}`} value={unit}>{unit}</option>
                          ))}
                          <option value={CUSTOM_QUOTE_UNIT_VALUE}>+ Outra...</option>
                        </select>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Custo unitário"
                          value={item.costUnitPrice || ''}
                          onChange={event => handleQuoteItemChange(i, item.id, 'costUnitPrice', event.target.value)}
                          onBlur={() => handleQuoteItemCurrencyBlur(i, item.id, 'costUnitPrice')}
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Total"
                          value={item.totalPrice || ''}
                          readOnly
                          className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg text-roman-text-main/80 cursor-not-allowed"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveQuoteItem(i, item.id)}
                          className="hidden lg:inline-flex h-full items-center justify-end text-[11px] text-red-700 hover:underline"
                        >
                          Remover
                        </button>
                      </div>

                      {hasCustomUnitInput && (
                        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 lg:max-w-[320px]">
                          <input
                            type="text"
                            placeholder="Sigla (ex.: M2)"
                            value={pendingCustomUnitByItem[itemUnitKey] || ''}
                            onChange={event => setPendingCustomUnitByItem(current => ({ ...current, [itemUnitKey]: event.target.value }))}
                            className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-surface outline-none focus:border-roman-primary"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuoteItemCustomUnitSave(i, item.id)}
                            className="px-3 py-2 text-xs font-medium rounded-sm border border-roman-primary/30 bg-roman-primary/10 text-roman-primary hover:bg-roman-primary/20"
                          >
                            Salvar
                          </button>
                        </div>
                      )}

                      {reference && (
                        <div className="mt-2 rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-900">
                          Histórico unitário: média {reference.averageUnitPriceLabel ?? '-'} · faixa {reference.minUnitPriceLabel ?? '-'} a {reference.maxUnitPriceLabel ?? '-'}
                        </div>
                      )}
                    </div>
  );
}
