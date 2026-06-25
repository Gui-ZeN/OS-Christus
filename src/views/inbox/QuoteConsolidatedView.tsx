import { useQuoteEditorContext } from './QuoteEditorContext';

/**
 * Modo "consolidado" do editor de Cotações: resumo lado a lado de cada
 * fornecedor (valores, nº de itens, prévia) com botão "Editar" que volta o foco
 * pro card. Sub-mordida do editor núcleo. Read-only (só dispara setQuoteEditorFocus).
 */
export function QuoteConsolidatedView() {
  const { visibleQuoteEditors, quoteAttachments, setQuoteEditorFocus } = useQuoteEditorContext();
  return (
    <div className="mb-6 space-y-4">
        <div className="rounded-sm border border-roman-border bg-roman-surface px-4 py-3">
          <div className="text-sm font-medium text-roman-text-main">Modo consolidado</div>
          <div className="mt-1 text-xs text-roman-text-sub">
            Use esta visão para comparar os fornecedores. Para editar campos e itens, volte para o fornecedor desejado.
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visibleQuoteEditors.map(({ quote, index: i }) => (
            <div key={`quote-summary-${i}`} className="rounded-sm border border-roman-border bg-roman-bg p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-roman-border/50 pb-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-roman-text-main">
                    Fornecedor {i < 26 ? String.fromCharCode(65 + i) : i + 1}
                  </div>
                  <div className="mt-1 truncate text-sm text-roman-text-sub">
                    {quote.vendor || 'Fornecedor não informado'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-roman-text-sub">
                    {quoteAttachments[i] ? `PDF: ${quoteAttachments[i]!.name}` : 'Sem PDF anexado'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuoteEditorFocus(i)}
                    className="rounded-sm border border-roman-primary bg-roman-primary/10 px-3 py-1 text-xs font-medium text-roman-primary hover:bg-roman-primary/15"
                  >
                    Editar
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Valor total</div>
                  <div className="mt-1 text-sm font-semibold text-roman-text-main">{quote.value || '-'}</div>
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Material</div>
                  <div className="mt-1 text-sm font-medium text-roman-text-main">{quote.materialValue || '-'}</div>
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Mão de obra</div>
                  <div className="mt-1 text-sm font-medium text-roman-text-main">{quote.laborValue || '-'}</div>
                </div>
                <div className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Itens</div>
                  <div className="mt-1 text-sm font-medium text-roman-text-main">{quote.items.length}</div>
                </div>
              </div>

              <div className="mt-3 rounded-sm border border-roman-border bg-roman-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Prévia dos itens</div>
                  <div className="text-[11px] text-roman-text-sub">
                    {quote.items.filter(item => item.description || item.materialName).length} preenchido(s)
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {quote.items
                    .filter(item => item.description || item.materialName)
                    .slice(0, 6)
                    .map(item => (
                      <span
                        key={`quote-summary-item-${i}-${item.id}`}
                        className="rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-2 py-1 text-[11px] text-roman-primary"
                      >
                        {item.materialName || item.description}
                      </span>
                    ))}
                  {quote.items.filter(item => item.description || item.materialName).length === 0 && (
                    <span className="text-xs text-roman-text-sub">Nenhum item preenchido ainda.</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
