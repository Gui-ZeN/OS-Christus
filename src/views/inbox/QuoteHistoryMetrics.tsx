import { buildBudgetHistorySummary, formatBudgetHistoryValue } from '../../utils/budgetHistory';

type BudgetHistory = ReturnType<typeof buildBudgetHistorySummary>;

/**
 * Grid de métricas da base histórica (Média · Faixa · Último comparável ·
 * Referências). Extraído do modal de Cotações do InboxView (2ª sub-mordida do
 * "elefante"). Apresentacional — só lê `history`.
 */
export function QuoteHistoryMetrics({ history }: { history: BudgetHistory }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
      <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
        <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Media</div>
        <div className="mt-1 text-lg font-serif text-roman-text-main">{formatBudgetHistoryValue(history.averageQuoteValue)}</div>
      </div>
      <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
        <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Faixa</div>
        <div className="mt-1 text-sm font-medium text-roman-text-main">
          {formatBudgetHistoryValue(history.minQuoteValue)} a {formatBudgetHistoryValue(history.maxQuoteValue)}
        </div>
      </div>
      <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
        <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Último comparável</div>
        <div className="mt-1 text-sm font-medium text-roman-text-main">{history.latestComparableValueLabel ?? '-'}</div>
        <div className="text-[11px] text-roman-text-sub">{history.latestComparableVendor ?? 'Sem fornecedor'}</div>
      </div>
      <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
        <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Referencias</div>
        <div className="mt-1 text-lg font-serif text-roman-text-main">{history.comparableQuoteCount}</div>
        <div className="text-[11px] text-roman-text-sub">cotações aproveitáveis</div>
      </div>
    </div>
  );
}
