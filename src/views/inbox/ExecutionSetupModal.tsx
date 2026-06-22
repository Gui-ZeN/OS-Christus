import React from 'react';
import { Loader2, Play } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';

interface ExecutionSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSending: boolean;
  onConfirm: () => void;
  paymentFlowParts: string;
  measurementSheetUrl: string;
  notes: string;
  onFieldChange: (field: 'paymentFlowParts' | 'measurementSheetUrl' | 'notes', value: string) => void;
  contractVendor: string;
  contractValue: string;
  progressPercent: number;
}

/** Modal de início de execução da obra (fluxo financeiro) — extraído do InboxView. */
export function ExecutionSetupModal(props: ExecutionSetupModalProps) {
  const {
    isOpen, onClose, isSending, onConfirm,
    paymentFlowParts, measurementSheetUrl, notes, onFieldChange,
    contractVendor, contractValue, progressPercent,
  } = props;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Iniciar Execução da Obra"
      description="Defina o fluxo financeiro que vai liberar os marcos de pagamento durante a execução."
      maxWidthClass="max-w-xl"
      footer={(
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
            Cancelar
          </button>
          <button
            disabled={isSending}
            onClick={() => void onConfirm()}
            className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Iniciar execução
          </button>
        </div>
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Fluxo de pagamento</label>
          <select
            value={paymentFlowParts}
            onChange={e => onFieldChange('paymentFlowParts', e.target.value)}
            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
          >
            {[1, 2, 3, 4, 5].map(parts => (
              <option key={parts} value={parts}>{parts === 1 ? 'À vista' : `${parts}x conforme andamento`}</option>
            ))}
          </select>
        </div>
        <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
          <div className="font-medium text-roman-text-main mb-1">Resumo do contrato</div>
          <div>Fornecedor: {contractVendor}</div>
          <div>Valor: {contractValue}</div>
          <div>Andamento inicial: {progressPercent}%</div>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Link da planilha de medição (opcional)</label>
        <input
          type="url"
          value={measurementSheetUrl}
          onChange={e => onFieldChange('measurementSheetUrl', e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/..."
          className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
        />
      </div>

      <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
        <div className="font-medium text-roman-text-main">Regra do fluxo</div>
        <div>Cada atualização de andamento com valor bruto cria um novo lançamento no financeiro.</div>
        <div>Os marcos (1x a 5x) ficam como referência de progresso da execução.</div>
      </div>

      <div>
        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Observações de início</label>
        <textarea
          value={notes}
          onChange={e => onFieldChange('notes', e.target.value)}
          placeholder="Ex: equipe mobilizada, cronograma validado e material entregue na unidade."
          className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
        />
      </div>
    </ModalShell>
  );
}
