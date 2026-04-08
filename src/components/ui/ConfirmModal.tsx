import React, { useState } from 'react';
import { AlertCircle, X, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  requireReason?: boolean;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDestructive = false,
  requireReason = false,
  isLoading = false
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const modalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setError('');
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen && modalRef.current) {
      // Simple focus trap: focus the first focusable element or the container
      const focusable = modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length > 0) {
        (focusable[0] as HTMLElement).focus();
      } else {
        modalRef.current.focus();
      }
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (requireReason) {
      if (!reason.trim()) {
        setError('Por favor, informe o motivo.');
        return;
      }
    }
    onConfirm(reason);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        ref={modalRef}
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-sm border border-roman-border bg-roman-surface shadow-2xl animate-in zoom-in-95 duration-200"
        role="dialog" 
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-full shrink-0 ${isDestructive ? 'bg-red-100 text-red-600' : 'bg-roman-primary/10 text-roman-primary'}`}>
              <AlertCircle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-serif font-medium text-roman-text-main mb-2">{title}</h3>
              <p className="text-sm text-roman-text-sub leading-relaxed mb-4">{description}</p>
              
              {requireReason && (
                <div className="mt-4">
                  <label htmlFor="confirm-modal-reason" className="block text-xs font-medium text-roman-text-main mb-1.5">Motivo (Obrigatório)</label>
                  <textarea
                    id="confirm-modal-reason"
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      if (error) setError('');
                    }}
                    className={`w-full h-24 p-3 text-sm bg-roman-bg border rounded-sm outline-none resize-none transition-colors ${error ? 'border-red-500 focus:border-red-500' : 'border-roman-border focus:border-roman-primary'}`}
                    placeholder="Descreva o motivo..."
                    autoFocus
                  />
                  {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="shrink-0 border-t border-roman-border bg-roman-bg px-6 py-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full rounded-sm px-4 py-2 text-sm font-medium text-roman-text-sub transition-colors hover:bg-roman-surface hover:text-roman-text-main disabled:opacity-50 sm:w-auto"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex w-full items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-70 sm:w-auto ${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-roman-sidebar hover:bg-roman-sidebar-light'}`}
          >
            {isLoading && <Loader2 size={14} className="animate-spin" />}
            {confirmText}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
