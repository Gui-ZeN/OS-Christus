import { buildBudgetHistorySummary, formatBudgetHistoryValue } from '../../utils/budgetHistory';
import { formatDateTimeSafe } from '../../utils/date';
import type { CatalogVendorPreference } from '../../services/catalogApi';
import { QuoteHistoryMetrics } from './QuoteHistoryMetrics';

type BudgetHistory = ReturnType<typeof buildBudgetHistorySummary>;

interface QuoteHistoryPanelProps {
  history: BudgetHistory;
  servicePreference: CatalogVendorPreference | null;
  ticketId: string;
}

/**
 * Painel "Base histórica (24 meses)" do modal de Cotações: métricas, fornecedor
 * preferencial, casos similares e referência por item/material. Extraído do
 * InboxView (3ª sub-mordida do "elefante"). Apresentacional — só lê props.
 */
export function QuoteHistoryPanel({ history, servicePreference, ticketId }: QuoteHistoryPanelProps) {
  return (
    <div className="mb-6 rounded-sm border border-roman-border bg-roman-bg p-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h4 className="text-sm font-serif text-roman-text-main">Base histórica (24 meses)</h4>
          <p className="text-xs text-roman-text-sub">
            {history.comparableTicketCount > 0
              ? `${history.comparableTicketCount} OS similares encontradas para comparação.`
              : 'Sem base histórica suficiente para comparar esta OS.'}
          </p>
        </div>
        <div className="text-xs text-roman-text-sub md:max-w-[48%]">
          <div className="mb-1">Termos base:</div>
          {history.basisTerms.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {history.basisTerms.map(term => (
                <span
                  key={`inbox-basis-term-${ticketId}-${term}`}
                  className="rounded-sm border border-roman-border bg-roman-surface px-2 py-0.5 text-[11px] text-roman-text-main"
                >
                  {term}
                </span>
              ))}
            </div>
          ) : (
            <div>não definidos</div>
          )}
        </div>
      </div>

      <QuoteHistoryMetrics history={history} />

      {(servicePreference || history.preferredVendor) && (
        <div className="mt-4 rounded-sm border border-emerald-200 bg-emerald-50/70 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-700">
                {servicePreference ? 'Fornecedor preferencial persistido' : 'Fornecedor preferencial sugerido'}
              </div>
              <div className="mt-1 text-sm font-medium text-emerald-950">
                {(servicePreference || history.preferredVendor)?.vendor}
              </div>
              <div className="text-[11px] text-emerald-800">
                {servicePreference
                  ? `${servicePreference.approvalCount} aprovação(ões) registradas para ${servicePreference.scopeName}`
                  : history.preferredVendor?.rationale.join(' · ')}
              </div>
            </div>
            <div className="text-[11px] text-emerald-900 md:text-right">
              <div>
                Média:{' '}
                {servicePreference
                  ? formatBudgetHistoryValue(servicePreference.averageApprovedValue ?? null)
                  : history.preferredVendor?.averageComparableValueLabel ?? '-'}
              </div>
              <div>
                Último comparável:{' '}
                {servicePreference
                  ? formatBudgetHistoryValue(servicePreference.lastApprovedValue ?? null)
                  : history.preferredVendor?.latestComparableValueLabel ?? '-'}
              </div>
            </div>
          </div>
        </div>
      )}

      {history.similarCases.length > 0 && (
        <div className="mt-4 space-y-2">
          {history.similarCases.slice(0, 3).map(item => (
            <div key={item.ticketId} className="flex flex-col gap-1 rounded-sm border border-roman-border/70 bg-roman-surface px-3 py-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium text-roman-text-main">{item.ticketId} · {item.subject}</div>
                <div className="text-[11px] text-roman-text-sub">
                  {item.vendor} · {item.sede} / {item.region} · {formatDateTimeSafe(item.date)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-serif text-roman-text-main">{item.valueLabel}</div>
                <div className="text-[11px] text-roman-text-sub">
                  Match: {item.sharedTerms.length > 0 ? item.sharedTerms.join(', ') : 'macroserviço/serviço'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.itemReferences.length > 0 && (
        <div className="mt-4 rounded-sm border border-roman-border bg-roman-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h5 className="text-[10px] uppercase tracking-widest text-roman-text-sub">Referência por item/material</h5>
              <p className="mt-1 text-[11px] text-roman-text-sub">Faixas unitárias observadas nas OS comparáveis.</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {history.itemReferences.slice(0, 4).map(item => (
              <div key={item.key} className="rounded-sm border border-roman-border/70 bg-roman-bg px-3 py-2">
                <div className="text-sm font-medium text-roman-text-main">{item.label}</div>
                <div className="text-[11px] text-roman-text-sub">
                  {item.sampleCount} referência(s) {item.unit ? `· ${item.unit}` : ''}
                </div>
                <div className="mt-1 text-[11px] text-roman-text-main">
                  Média unitária: {item.averageUnitPriceLabel ?? '-'}
                </div>
                <div className="text-[11px] text-roman-text-sub">
                  Faixa: {item.minUnitPriceLabel ?? '-'} a {item.maxUnitPriceLabel ?? '-'}
                </div>
                <div className="text-[11px] text-roman-text-sub">
                  Último fornecedor: {item.latestVendor ?? '-'} · {item.latestUnitPriceLabel ?? '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
