import React from 'react';

interface PropertyFieldProps {
  label: string;
  value: string;
  highlight?: boolean;
}

export function PropertyField({ label, value, highlight }: PropertyFieldProps) {
  return (
    <div>
      <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">{label}</label>
      <div className={`w-full border rounded-sm px-3 py-2 cursor-pointer transition-colors flex justify-between items-center ${highlight ? 'border-roman-primary bg-roman-primary/5 text-roman-primary' : 'border-roman-border bg-roman-bg hover:border-roman-primary/50 text-roman-text-main'}`}>
        <span className="text-[13px] font-medium">{value}</span>
      </div>
    </div>
  );
}
