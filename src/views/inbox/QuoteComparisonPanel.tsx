import React from 'react';
import { formatCurrency as formatCurrencyInput, parseCurrency as parseCurrencyInput } from '../../utils/currency';
import type { QuoteComparisonSection, QuoteDraft } from './types';
import { normalizeQuoteSection } from './quotes';

interface QuoteComparisonPanelProps {
  quoteComparisonSections: QuoteComparisonSection[];
  quotes: QuoteDraft[];
  quoteGrandTotals: number[];
}

/**
 * Comparativo consolidado das cotações (tabela lado a lado por fornecedor).
 * Extraído do modal de Cotações do InboxView (4ª sub-mordida do "elefante").
 * Apresentacional — deriva tudo dos props (sem estado).
 */
export function QuoteComparisonPanel({ quoteComparisonSections, quotes, quoteGrandTotals }: QuoteComparisonPanelProps) {
  return (
    <div className="mb-6 rounded-sm border border-roman-border bg-roman-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-serif text-roman-text-main">Comparativo consolidado</h4>
              <p className="text-xs text-roman-text-sub">Use esta grade para conferir quantidade, custo unitário e total cobrado por fornecedor.</p>
            </div>
          </div>

      {quoteComparisonSections.length === 0 ? (
        <div className="mt-3 rounded-sm border border-dashed border-roman-border bg-roman-bg px-3 py-4 text-sm text-roman-text-sub">
          Adicione itens nas cotações para montar o comparativo lado a lado.
        </div>
      ) : (
        <div className="mt-4 space-y-4 overflow-x-auto">
          {quoteComparisonSections.map(section => (
            <div key={section.key} className="min-w-[980px] rounded-2xl border border-roman-border bg-roman-bg overflow-hidden">
              <div className="border-b border-roman-border px-4 py-2">
                <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">{section.label}</div>
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-roman-border bg-roman-surface text-left">
                    <th className="px-3 py-2 font-medium text-roman-text-main">Descrição</th>
                    <th className="px-3 py-2 font-medium text-roman-text-main">Qtd.</th>
                    <th className="px-3 py-2 font-medium text-roman-text-main">Und.</th>
                    {quotes.map((quote, index) => (
                      <th key={`${section.key}-quote-${index}`} colSpan={2} className="border-l border-roman-border px-3 py-2">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">
                          Fornecedor {index < 26 ? String.fromCharCode(65 + index) : index + 1}
                        </div>
                        <div className="mt-1 text-sm font-medium text-roman-text-main">{quote.vendor || 'Fornecedor não informado'}</div>
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-roman-border bg-roman-surface text-[11px] text-roman-text-sub">
                    <th />
                    <th />
                    <th />
                    {quotes.map((_, index) => (
                      <React.Fragment key={`${section.key}-labels-${index}`}>
                        <th className="border-l border-roman-border px-3 py-2 font-medium">Custo unit.</th>
                        <th className="px-3 py-2 font-medium">Valor cobrado</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map(row => (
                    <tr key={row.key} className="border-b border-roman-border/70 align-top">
                      <td className="px-3 py-2 text-roman-text-main">{row.description}</td>
                      <td className="px-3 py-2 text-roman-text-sub">{row.quantity || '-'}</td>
                      <td className="px-3 py-2 text-roman-text-sub">{row.unit || '-'}</td>
                      {row.values.map((value, index) => (
                        <React.Fragment key={`${row.key}-${index}`}>
                          {!value.costUnitPrice && !value.chargedTotalPrice ? (
                            <td colSpan={2} className="border-l border-roman-border px-3 py-2">
                              <div className="rounded-lg border border-dashed border-roman-border/80 bg-roman-surface px-3 py-2 text-center text-[11px] text-roman-text-sub">
                                Não cotado nesta proposta
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="border-l border-roman-border px-3 py-2 text-roman-text-sub">{value.costUnitPrice || '-'}</td>
                              <td className="px-3 py-2 text-roman-text-main">{value.chargedTotalPrice || '-'}</td>
                            </>
                          )}
                        </React.Fragment>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-roman-surface">
                    <td colSpan={3} className="px-3 py-2 font-medium text-roman-text-main">Subtotal da seção</td>
                    {quotes.map((quote, index) => {
                      const subtotal = quote.items
                        .filter(item => normalizeQuoteSection(item.section) === section.key)
                        .reduce((sum, item) => sum + parseCurrencyInput(item.totalPrice || ''), 0);
                      return (
                        <React.Fragment key={`${section.key}-subtotal-${index}`}>
                          <td className="border-l border-roman-border px-3 py-2 text-roman-text-sub">-</td>
                          <td className="px-3 py-2 font-medium text-roman-text-main">
                            {subtotal > 0 ? formatCurrencyInput(subtotal) : '-'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
          <div className="min-w-[980px] rounded-2xl border border-roman-primary/20 bg-roman-primary/5 overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr>
                  <td colSpan={3} className="px-3 py-3 font-medium text-roman-text-main">Total geral por fornecedor</td>
                  {quotes.map((_, index) => (
                    <React.Fragment key={`grand-total-${index}`}>
                      <td className="border-l border-roman-border px-3 py-3 text-roman-text-sub">-</td>
                      <td className="px-3 py-3 font-semibold text-roman-text-main">
                        {quoteGrandTotals[index] > 0 ? formatCurrencyInput(quoteGrandTotals[index]) : '-'}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
        </div>
  );
}
