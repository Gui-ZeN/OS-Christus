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

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalShell({
  isOpen,
  onClose,
  title,
  description,
  maxWidthClass = 'max-w-2xl',
  children,
  footer,
}: ModalShellProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  // Move o foco para dentro do modal ao abrir e o restaura ao fechar.
  React.useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    if (node) {
      const focusable = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable || node).focus();
    }
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen]);

  // Trava o scroll do body enquanto o modal está aberto.
  React.useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Escape fecha; Tab fica preso dentro do modal (focus trap).
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const node = dialogRef.current as HTMLElement | null;
      if (!node) return;
      const focusable = (Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[]).filter(
        el => el.offsetParent !== null || el === document.activeElement
      );
      if (focusable.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in"
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
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
