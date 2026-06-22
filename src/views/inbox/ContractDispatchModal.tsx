import React from 'react';
import { FileText, Loader2, Shield } from 'lucide-react';
import { ModalShell } from '../../components/ui/ModalShell';

interface ContractDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSending: boolean;
  onSend: () => void;
  file: File | null;
  onFileChange: (file: File) => void;
  contractVendor: string;
  contractValue: string;
}

/** Modal de anexo do contrato para aprovação da Diretoria (extraído do InboxView). */
export function ContractDispatchModal(props: ContractDispatchModalProps) {
  const { isOpen, onClose, isSending, onSend, file, onFileChange, contractVendor, contractValue } = props;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => {
        if (isSending) return;
        onClose();
      }}
      title="Anexar Contrato para Diretoria"
      description="Após o aceite do orçamento, anexe o contrato para a Diretoria aprovar."
      maxWidthClass="max-w-lg"
      footer={(
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 border border-roman-border text-roman-text-main hover:bg-roman-bg rounded-sm font-medium transition-colors text-sm disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={() => void onSend()}
            disabled={isSending || !file}
            className="px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSending ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            {isSending ? 'Enviando...' : 'Enviar para Aprovação'}
          </button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
          <div className="font-medium text-roman-text-main mb-1">Resumo do contrato</div>
          <div>Fornecedor: {contractVendor}</div>
          <div>Valor: {contractValue}</div>
        </div>

        <div className="border-2 border-dashed border-roman-border rounded-sm p-6 text-center bg-roman-bg relative hover:bg-roman-border-light transition-colors cursor-pointer">
          <input
            type="file"
            accept=".pdf"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={event => {
              if (event.target.files && event.target.files.length > 0) {
                onFileChange(event.target.files[0]);
              }
            }}
          />
          <FileText size={28} className="mx-auto text-roman-primary mb-2" />
          {file ? (
            <div className="text-sm font-medium text-roman-text-main">{file.name}</div>
          ) : (
            <>
              <div className="text-sm font-medium text-roman-text-main mb-1">Selecione o contrato em PDF</div>
              <div className="text-xs text-roman-text-sub">Esse arquivo será registrado antes da aprovação da Diretoria</div>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
