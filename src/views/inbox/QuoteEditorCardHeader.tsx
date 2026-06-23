import { Paperclip } from 'lucide-react';

interface QuoteEditorCardHeaderProps {
  i: number;
  canRemoveSlot: boolean;
  attachment: File | null;
  handleRemoveQuoteSlot: (index: number) => void;
  handleQuoteAttachmentChange: (index: number, file: File | null) => void;
}

/**
 * Cabeçalho de um card de fornecedor do editor de Cotações ("Fornecedor X" +
 * Remover slot + Anexar/Trocar PDF). Sub-mordida do editor núcleo. Presentacional.
 */
export function QuoteEditorCardHeader({ i, canRemoveSlot, attachment, handleRemoveQuoteSlot, handleQuoteAttachmentChange }: QuoteEditorCardHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4 pb-2 border-b border-roman-border/50">
            <span className="text-sm font-medium text-roman-text-main">
              Fornecedor {i < 26 ? String.fromCharCode(65 + i) : i + 1}
            </span>
            <div className="flex items-center gap-3">
              {canRemoveSlot && (
                <button
                  type="button"
                  onClick={() => handleRemoveQuoteSlot(i)}
                  className="text-xs text-red-700 hover:underline"
                >
                  Remover
                </button>
              )}
              <label className="text-xs text-roman-primary hover:underline flex items-center gap-1 cursor-pointer">
                <Paperclip size={12} /> {attachment ? 'Trocar PDF' : 'Anexar PDF'}
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => handleQuoteAttachmentChange(i, e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
  );
}
