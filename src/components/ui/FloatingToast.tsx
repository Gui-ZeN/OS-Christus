import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface FloatingToastProps {
  message: string | null;
}

export function FloatingToast({ message }: FloatingToastProps) {
  if (!message) return null;

  const isError = message.toLowerCase().includes('erro');

  return (
    <div className="fixed top-5 left-1/2 z-[140] w-[min(92vw,760px)] -translate-x-1/2 pointer-events-none">
      <div
        className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-top-4 fade-in ${
          isError
            ? 'border-red-300 bg-red-800/95 text-white'
            : 'border-emerald-300 bg-emerald-700/95 text-white'
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

