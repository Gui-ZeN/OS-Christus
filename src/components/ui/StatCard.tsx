import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  highlight?: boolean;
  onClick?: () => void;
}

export function StatCard({ title, value, highlight, onClick }: StatCardProps) {
  return (
    <div 
      onClick={onClick} 
      className={`rounded-sm border px-4 py-4 cursor-pointer transition-colors ${highlight ? 'bg-roman-primary/5 border-roman-primary' : 'bg-roman-surface border-roman-border hover:border-roman-primary/50'}`}
    >
      <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub mb-1.5">{title}</div>
      <div className={`text-2xl sm:text-[1.8rem] font-serif leading-none ${highlight ? 'text-roman-primary' : 'text-roman-text-main'}`}>{value}</div>
    </div>
  );
}
