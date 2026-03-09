import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  let bgColor = 'bg-stone-100';
  let textColor = 'text-stone-800';
  let dotColor = 'bg-stone-400';

  const s = status.toLowerCase();

  if (s.includes('nova os')) {
    bgColor = 'bg-blue-50';
    textColor = 'text-blue-700';
    dotColor = 'bg-blue-500';
  } else if (s.includes('aguardando parecer') || s.includes('aguardando aprova??o')) {
    bgColor = 'bg-amber-50';
    textColor = 'text-amber-700';
    dotColor = 'bg-amber-500';
  } else if (s.includes('or?amento') || s.includes('cota??o')) {
    bgColor = 'bg-orange-50';
    textColor = 'text-orange-700';
    dotColor = 'bg-orange-500';
  } else if (s.includes('contrato') || s.includes('preliminares')) {
    bgColor = 'bg-indigo-50';
    textColor = 'text-indigo-700';
    dotColor = 'bg-indigo-500';
  } else if (s.includes('em andamento') || s.includes('execu??o')) {
    bgColor = 'bg-purple-50';
    textColor = 'text-purple-700';
    dotColor = 'bg-purple-500';
  } else if (s.includes('pagamento')) {
    bgColor = 'bg-emerald-50';
    textColor = 'text-emerald-700';
    dotColor = 'bg-emerald-500';
  } else if (s.includes('encerrada')) {
    bgColor = 'bg-stone-100';
    textColor = 'text-stone-500';
    dotColor = 'bg-stone-400';
  } else if (s.includes('cancelada') || s.includes('reprovad')) {
    bgColor = 'bg-red-50';
    textColor = 'text-red-700';
    dotColor = 'bg-red-500';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-black/5 px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`}></span>
      {status}
    </span>
  );
}
