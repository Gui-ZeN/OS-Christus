import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  highlight?: boolean;
  onClick?: () => void;
  subtitle?: string;
}

export function StatCard({ title, value, highlight, onClick, subtitle }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 cursor-pointer transition-colors shadow-sm ${highlight ? 'bg-roman-primary/5 border-roman-primary/50' : 'bg-roman-surface border-roman-border hover:border-roman-primary/40'}`}
    >
      <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub">{title}</div>
      <div className={`mt-2 text-[1.65rem] sm:text-[1.75rem] font-serif leading-none ${highlight ? 'text-roman-primary' : 'text-roman-text-main'}`}>{value}</div>
      {subtitle ? <div className="mt-2 text-xs text-roman-text-sub">{subtitle}</div> : null}
    </div>
  );
}
