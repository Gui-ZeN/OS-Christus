import React from 'react';

interface PropertyFieldProps {
  label: string;
  value: string;
  highlight?: boolean;
}

export function PropertyField({ label, value, highlight }: PropertyFieldProps) {
  return (
    <div>
      <label className="block text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub mb-1">{label}</label>
      <div className={`w-full border rounded-xl px-3 py-2 transition-colors flex justify-between items-center ${highlight ? 'border-roman-primary/50 bg-roman-primary/5 text-roman-primary' : 'border-roman-border bg-roman-bg text-roman-text-main'}`}>
        <span className="text-[12px] font-medium leading-snug">{value}</span>
      </div>
    </div>
  );
}
