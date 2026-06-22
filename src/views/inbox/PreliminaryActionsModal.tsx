import React from 'react';
import { CheckSquare } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';
import { PRELIMINARY_ITEMS, type PreliminaryChecklistKey, type PreliminaryFormState } from './preliminary';

interface PreliminaryActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: PreliminaryFormState;
  onToggleItem: (id: PreliminaryChecklistKey) => void;
  onFieldChange: (field: 'materialEta' | 'plannedStartAt' | 'blockerNotes', value: string) => void;
  onSaveChecklist: () => void;
  onCompleteAndStart: () => void;
  canComplete: boolean;
  summary: string;
}

/** Modal de ações preliminares (checklist + cronograma) — extraído do InboxView. */
export function PreliminaryActionsModal(props: PreliminaryActionsModalProps) {
  const { isOpen, onClose, form, onToggleItem, onFieldChange, onSaveChecklist, onCompleteAndStart, canComplete, summary } = props;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Ações Preliminares"
      description="Registre compras, cronograma, liberações e impedimentos antes de iniciar a execução."
      maxWidthClass="max-w-2xl"
      footer={(
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm">
            Cancelar
          </button>
          <button
            onClick={onSaveChecklist}
            className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm"
          >
            Salvar checklist
          </button>
          <button
            disabled={!canComplete}
            onClick={onCompleteAndStart}
            className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Concluir e Iniciar Execução
          </button>
        </div>
      )}
    >
      <div>
        <p className="mt-2 text-xs text-roman-text-sub">
          Checklist concluído: {PRELIMINARY_ITEMS.filter(item => form[item.id]).length}/{PRELIMINARY_ITEMS.length}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PRELIMINARY_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onToggleItem(item.id)}
            className={`w-full flex items-center gap-3 p-3 border rounded-sm text-left transition-colors ${
              form[item.id]
                ? 'border-roman-primary bg-roman-primary/5 text-roman-primary'
                : 'border-roman-border text-roman-text-main hover:border-roman-primary/50'
            }`}
          >
            <div className={`w-4 h-4 border rounded-sm flex items-center justify-center flex-shrink-0 ${form[item.id] ? 'bg-roman-primary border-roman-primary' : 'border-roman-border'}`}>
              {form[item.id] && <CheckSquare size={10} className="text-white" />}
            </div>
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Previsão de chegada do material</label>
          <input
            type="date"
            value={form.materialEta}
            onChange={e => onFieldChange('materialEta', e.target.value)}
            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Data prevista para início</label>
          <input
            type="date"
            value={form.plannedStartAt}
            onChange={e => onFieldChange('plannedStartAt', e.target.value)}
            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Impedimentos / observações</label>
        <textarea
          value={form.blockerNotes}
          onChange={e => onFieldChange('blockerNotes', e.target.value)}
          placeholder="Ex: aguardando liberação da unidade, janela sem aula, entrega do fornecedor."
          className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
        />
      </div>

      <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub space-y-1">
        <div className="font-medium text-roman-text-main">Resumo operacional</div>
        <div>{summary}</div>
        {form.blockerNotes.trim() && <div>Impedimentos: {form.blockerNotes.trim()}</div>}
      </div>
    </ModalShell>
  );
}
