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
      className={`p-5 border rounded-sm cursor-pointer transition-colors ${highlight ? 'bg-roman-primary/5 border-roman-primary' : 'bg-roman-surface border-roman-border hover:border-roman-primary/50'}`}
    >
      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">{title}</div>
      <div className={`text-3xl font-serif ${highlight ? 'text-roman-primary' : 'text-roman-text-main'}`}>{value}</div>
    </div>
  );
}
