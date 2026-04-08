import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  highlight?: boolean;
  onClick?: () => void;
  subtitle?: string;
}

export function StatCard({ title, value, highlight, onClick, subtitle }: StatCardProps) {
  const clickable = typeof onClick === 'function';

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors shadow-sm cursor-pointer ${
          highlight
            ? 'bg-roman-primary/5 border-roman-primary/50'
            : 'bg-roman-surface border-roman-border hover:border-roman-primary/40'
        }`}
      >
        <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub">{title}</div>
        <div className={`mt-2 text-[1.65rem] sm:text-[1.75rem] font-serif leading-none ${highlight ? 'text-roman-primary' : 'text-roman-text-main'}`}>{value}</div>
        {subtitle ? <div className="mt-2 text-xs text-roman-text-sub">{subtitle}</div> : null}
      </button>
    );
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 transition-colors shadow-sm cursor-default ${
        highlight
          ? 'bg-roman-primary/5 border-roman-primary/50'
          : 'bg-roman-surface border-roman-border'
      }`}
    >
      <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub">{title}</div>
      <div className={`mt-2 text-[1.65rem] sm:text-[1.75rem] font-serif leading-none ${highlight ? 'text-roman-primary' : 'text-roman-text-main'}`}>{value}</div>
      {subtitle ? <div className="mt-2 text-xs text-roman-text-sub">{subtitle}</div> : null}
    </div>
  );
}
