import React from 'react';
import { repairMojibake } from '../../utils/text';

interface PropertyFieldProps {
  label: string;
  value: string;
  highlight?: boolean;
}

export function PropertyField({ label, value, highlight }: PropertyFieldProps) {
  const normalizedLabel = repairMojibake(label);
  const normalizedValue = repairMojibake(value);

  return (
    <div>
      <label className="block text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub mb-1">{normalizedLabel}</label>
      <div className={`w-full border rounded-xl px-3 py-2 transition-colors ${highlight ? 'border-roman-primary/50 bg-roman-primary/5 text-roman-primary' : 'border-roman-border bg-roman-bg text-roman-text-main'}`}>
        <span className="block min-w-0 break-all text-[12px] font-medium leading-snug">{normalizedValue}</span>
      </div>
    </div>
  );
}
