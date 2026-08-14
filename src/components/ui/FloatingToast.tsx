import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface FloatingToastProps {
  message: string | null;
  /** Explicit type overrides the heuristic detection. */
  type?: 'success' | 'error';
}

export function FloatingToast({ message, type }: FloatingToastProps) {
  if (!message) return null;

  const isError = type === 'error' || (type === undefined && message.toLowerCase().includes('erro'));

  return (
    <div className="fixed top-5 left-1/2 z-[140] w-[min(92vw,760px)] -translate-x-1/2 pointer-events-none">
      <div
        className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-top-4 fade-in ${
          isError
            ? 'border-roman-danger/35 bg-roman-danger text-roman-on-danger'
            : 'border-roman-success/35 bg-roman-success text-roman-on-success'
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          {isError ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span className="text-sm font-medium">{message}</span>
        </div>
      </div>
    </div>
  );
}

