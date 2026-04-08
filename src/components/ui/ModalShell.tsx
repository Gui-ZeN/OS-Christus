import React from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ModalShell({
  isOpen,
  onClose,
  title,
  description,
  maxWidthClass = 'max-w-2xl',
  children,
  footer,
}: ModalShellProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`flex w-full ${maxWidthClass} max-h-[92vh] flex-col overflow-hidden rounded-sm border border-roman-border bg-roman-surface shadow-xl`}
      >
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-roman-border bg-roman-bg px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 className="font-serif text-lg text-roman-text-main font-medium">{title}</h3>
            {description && <p className="mt-1 text-sm text-roman-text-sub">{description}</p>}
          </div>
          <button onClick={onClose} className="text-roman-text-sub hover:text-roman-text-main transition-colors" aria-label="Fechar modal">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-roman-border bg-roman-surface px-4 py-4 sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
