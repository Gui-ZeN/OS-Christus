import { ChevronDown } from 'lucide-react';
import type { Quote } from '../../types';

interface AdditiveReferenceCardProps {
  expanded: boolean;
  onToggle: () => void;
  approvedQuote: Quote | null;
}

/**
 * Card "Orçamento base escolhido": mostra a cotação inicial aprovada como
 * referência para montar um aditivo. Extraído do modal de Cotações do InboxView
 * (1ª sub-mordida do "elefante"). Apresentacional — só lê props.
 */
export function AdditiveReferenceCard({ expanded, onToggle, approvedQuote }: AdditiveReferenceCardProps) {
  return (
    <div className="rounded-sm border border-roman-border bg-roman-bg p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Orçamento base escolhido</div>
          <div className="mt-1 text-sm text-roman-text-main">Referência para montar o aditivo</div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-white px-2.5 py-1 text-xs font-medium text-roman-text-main hover:bg-roman-bg"
        >
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {expanded ? 'Recolher' : 'Expandir'}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 rounded-sm border border-roman-border bg-white p-3 text-sm text-roman-text-main">
          {approvedQuote ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Fornecedor aprovado</div>
                <div className="mt-1 font-medium">{approvedQuote.vendor || 'Não informado'}</div>
              </div>
              <div>
                <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Valor aprovado</div>
                <div className="mt-1 font-medium">{approvedQuote.totalValue || approvedQuote.value || '-'}</div>
              </div>
              <div>
                <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Material</div>
                <div className="mt-1">{approvedQuote.materialValue || '-'}</div>
              </div>
              <div>
                <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Mão de obra</div>
                <div className="mt-1">{approvedQuote.laborValue || '-'}</div>
              </div>
            </div>
          ) : (
            <div className="text-roman-text-sub">Nenhum orçamento inicial aprovado encontrado para usar como referência.</div>
          )}
        </div>
      )}
    </div>
  );
}
