import React from 'react';
import { FileText, Loader2, RefreshCw, X } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import { formatCurrency as formatCurrencyInput, sanitizeCurrencyTypingInput } from '../../utils/currency';

interface ProgressUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSending: boolean;
  onSave: () => void;
  // Form
  grossAmount: string;
  budgetSource: 'initial' | 'additive';
  notes: string;
  onGrossChange: (value: string) => void;
  onGrossBlur: () => void;
  onBudgetSourceChange: (value: 'initial' | 'additive') => void;
  onNotesChange: (value: string) => void;
  // Valores computados (somente leitura)
  draftProgressPercent: number;
  activeProgressPercent: number;
  projectedAccumulatedGross: number;
  currentAccumulatedGross: number;
  activeExpectedBaselineValue: number;
  activeReleasedPercent: number;
  activeNextMilestonePercent: number | null;
  activeMilestones: number[];
  paymentFlowParts: number | null | undefined;
  // Anexos
  files: File[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
}

/** Modal de atualização de andamento da obra — extraído do InboxView. */
export function ProgressUpdateModal(props: ProgressUpdateModalProps) {
  const {
    isOpen, onClose, isSending, onSave,
    grossAmount, budgetSource, notes, onGrossChange, onGrossBlur, onBudgetSourceChange, onNotesChange,
    draftProgressPercent, activeProgressPercent, projectedAccumulatedGross, currentAccumulatedGross,
    activeExpectedBaselineValue, activeReleasedPercent, activeNextMilestonePercent, activeMilestones,
    paymentFlowParts, files, fileInputRef, onAddFiles, onRemoveFile,
  } = props;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Atualizar Andamento da Obra"
      description="Informe o valor bruto do lançamento/etapa e o sistema somará ao acumulado para calcular o percentual executado."
      maxWidthClass="max-w-xl"
      footer={(
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
            Cancelar
          </button>
          <button
            disabled={isSending}
            onClick={() => void onSave()}
            className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Salvar andamento
          </button>
        </div>
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Valor bruto deste lançamento/etapa</label>
          <input
            type="text"
            inputMode="decimal"
            value={grossAmount}
            onChange={event => onGrossChange(sanitizeCurrencyTypingInput(event.target.value))}
            onBlur={onGrossBlur}
            placeholder="Ex: 12500,00"
            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
          />
          <div className="mt-2">
            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Origem do valor</label>
            <select
              value={budgetSource}
              onChange={event => onBudgetSourceChange(event.target.value === 'additive' ? 'additive' : 'initial')}
              className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
            >
              <option value="initial">Orçamento inicial</option>
              <option value="additive">Aditivo</option>
            </select>
          </div>
        </div>
        <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
          <div className="font-medium text-roman-text-main">Percentual calculado</div>
          <div className="mt-1 text-base font-semibold text-roman-text-main">{draftProgressPercent}%</div>
          <div className="mt-1">Andamento atual salvo: {activeProgressPercent}%</div>
          <div className="mt-1">Bruto acumulado projetado: {formatCurrencyInput(projectedAccumulatedGross)}</div>
        </div>
      </div>

      {activeMilestones.length > 0 && activeExpectedBaselineValue > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Atalhos por marco</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {activeMilestones.map(milestone => {
              const milestoneGross = (activeExpectedBaselineValue * milestone) / 100;
              const projectedGross = Math.max(0, milestoneGross - currentAccumulatedGross);
              const isCompleted = milestone <= activeProgressPercent;
              return (
                <button
                  key={milestone}
                  type="button"
                  onClick={() => onGrossChange(formatCurrencyInput(projectedGross))}
                  className={[
                    'rounded-sm border px-3 py-3 text-left transition-colors',
                    isCompleted
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary/40',
                  ].join(' ')}
                >
                  <div className="text-[10px] font-serif uppercase tracking-widest opacity-75">Marco</div>
                  <div className="mt-1 text-base font-semibold">{milestone}%</div>
                  <div className="mt-1 text-[10px]">{formatCurrencyInput(projectedGross)}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
        <div className="font-medium text-roman-text-main">Valor de referência</div>
        <div>Previsto inicial: {activeExpectedBaselineValue > 0 ? formatCurrencyInput(activeExpectedBaselineValue) : 'Não definido'}</div>
        <div>Bruto acumulado atual: {formatCurrencyInput(currentAccumulatedGross)}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-roman-text-sub">
        <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
          <div className="font-medium text-roman-text-main">Fluxo</div>
          <div>{paymentFlowParts ? `${paymentFlowParts}x` : 'Não definido'}</div>
        </div>
        <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
          <div className="font-medium text-roman-text-main">Liberado até agora</div>
          <div>{activeReleasedPercent}%</div>
        </div>
        <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
          <div className="font-medium text-roman-text-main">Próximo marco</div>
          <div>{activeNextMilestonePercent != null ? `${activeNextMilestonePercent}%` : 'Todos liberados'}</div>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Observações</label>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Ex: 40% concluído, com estrutura metálica finalizada e aguardando acabamento."
          className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
        />
      </div>

      <div>
        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Anexos do relatório (opcional)</label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.xml,.csv,.txt"
              onChange={event => {
                const next = Array.from(event.target.files || []);
                if (next.length === 0) return;
                onAddFiles(next);
                event.currentTarget.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-sm border border-roman-border bg-roman-surface px-3 py-2 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary"
            >
              Anexar arquivos
            </button>
            <span className="text-xs text-roman-text-sub">{files.length} arquivo(s)</span>
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file, index) => (
                <span key={`${file.name}-${file.size}-${index}`} className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-[11px] text-roman-text-main">
                  <FileText size={12} />
                  <span className="max-w-[220px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveFile(index)}
                    className="text-roman-text-sub hover:text-red-600"
                    aria-label={`Remover arquivo ${file.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
