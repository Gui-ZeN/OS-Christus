import { Plus } from 'lucide-react';
import type { QuoteDraft } from './types';

interface QuoteEditorTabsProps {
  quotes: QuoteDraft[];
  focus: number | 'all';
  onSelectFocus: (focus: number | 'all') => void;
  onAddSlot: () => void;
  canAddSlot: boolean;
}

/**
 * Barra seletora de fornecedores do editor de Cotações (abas A/B/C… +
 * Consolidado + "Adicionar cotação"). 1ª sub-mordida do EDITOR núcleo do
 * "elefante". Presentacional — troca o foco e adiciona slot via callbacks.
 */
export function QuoteEditorTabs({ quotes, focus, onSelectFocus, onAddSlot, canAddSlot }: QuoteEditorTabsProps) {
  return (
    <div id="quote-editor-start" className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-roman-text-sub">Fornecedor:</span>
        <button
          type="button"
          onClick={() => onSelectFocus(0)}
          className={`rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors ${
            focus === 0
              ? 'border-roman-primary bg-roman-primary/10 text-roman-primary'
              : 'border-roman-border bg-roman-surface text-roman-text-main hover:bg-roman-bg'
          }`}
        >
          A
        </button>
        {quotes.slice(1).map((_, offset) => {
          const index = offset + 1;
          const label = index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
          return (
          <button
            key={`quote-focus-${index}`}
            type="button"
            onClick={() => onSelectFocus(index)}
            className={`rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors ${
              focus === index
                ? 'border-roman-primary bg-roman-primary/10 text-roman-primary'
                : 'border-roman-border bg-roman-surface text-roman-text-main hover:bg-roman-bg'
            }`}
          >
            {label}
          </button>
          );
        })}
        <button
          type="button"
          onClick={() => onSelectFocus('all')}
          className={`rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors ${
            focus === 'all'
              ? 'border-roman-primary bg-roman-primary/10 text-roman-primary'
              : 'border-roman-border bg-roman-surface text-roman-text-main hover:bg-roman-bg'
          }`}
        >
          Consolidado
        </button>
      </div>
      {canAddSlot && (
        <button
          type="button"
          onClick={onAddSlot}
          className="inline-flex items-center gap-2 rounded-sm border border-roman-border bg-roman-surface px-3 py-1.5 text-xs font-medium text-roman-text-main hover:bg-roman-bg"
        >
          <Plus size={12} />
          Adicionar cotação
        </button>
      )}
    </div>
  );
}
