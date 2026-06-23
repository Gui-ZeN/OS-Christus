import type { ProposalHeaderDraft } from './types';

interface ProposalHeaderFormProps {
  value: ProposalHeaderDraft;
  onChange: (field: keyof ProposalHeaderDraft, value: string) => void;
  onCurrencyBlur: (field: keyof ProposalHeaderDraft) => void;
}

/**
 * Form "Cabeçalho da proposta" do modal de Cotações (unidade, local, pasta,
 * contratado, quantidade e valor previsto). Extraído do InboxView (5ª sub-mordida
 * do "elefante"). Controlado pelo pai via `value` + handlers genéricos.
 */
export function ProposalHeaderForm({ value, onChange, onCurrencyBlur }: ProposalHeaderFormProps) {
  return (
    <div className="mb-6 rounded-sm border border-roman-border bg-roman-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-serif text-roman-text-main">Cabeçalho da proposta</h4>
              <p className="text-xs text-roman-text-sub">Estruture a rodada com unidade, local e pasta da referência enviada pelo solicitante.</p>
            </div>
            <span className="rounded-sm border border-roman-border bg-roman-bg px-2 py-1 text-[11px] text-roman-text-sub">Comparativo lado a lado</span>
          </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Unidade</label>
          <input
            type="text"
            value={value.unitName}
            onChange={event => onChange('unitName', event.target.value)}
            className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Local</label>
          <input
            type="text"
            placeholder="Ex.: 9º andar"
            value={value.location}
            onChange={event => onChange('location', event.target.value)}
            className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Pasta / Link</label>
          <input
            type="text"
            placeholder="Cole o link da pasta"
            value={value.folderLink}
            onChange={event => onChange('folderLink', event.target.value)}
            className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Contratado / referência</label>
          <input
            type="text"
            placeholder="Fornecedor já contratado, se houver"
            value={value.contractedVendor}
            onChange={event => onChange('contractedVendor', event.target.value)}
            className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Quantidade total</label>
          <input
            type="text"
            placeholder="Ex.: 212 m²"
            value={value.totalQuantity}
            onChange={event => onChange('totalQuantity', event.target.value)}
            className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor total previsto</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={value.totalEstimatedValue}
            onChange={event => onChange('totalEstimatedValue', event.target.value)}
            onBlur={() => onCurrencyBlur('totalEstimatedValue')}
            className="w-full text-sm p-2 border border-roman-border rounded-sm bg-roman-bg outline-none focus:border-roman-primary"
          />
        </div>
      </div>
        </div>
  );
}
