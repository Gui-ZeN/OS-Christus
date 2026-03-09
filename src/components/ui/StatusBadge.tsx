import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  let bgColor = 'bg-stone-100';
  let textColor = 'text-stone-800';
  let dotColor = 'bg-stone-400';

  const normalizedStatus = status
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalizedStatus.includes('nova os')) {
    bgColor = 'bg-blue-50';
    textColor = 'text-blue-700';
    dotColor = 'bg-blue-500';
  } else if (normalizedStatus.includes('aguardando parecer') || normalizedStatus.includes('aguardando aprovacao')) {
    bgColor = 'bg-amber-50';
    textColor = 'text-amber-700';
    dotColor = 'bg-amber-500';
  } else if (normalizedStatus.includes('orcamento') || normalizedStatus.includes('cotacao')) {
    bgColor = 'bg-orange-50';
    textColor = 'text-orange-700';
    dotColor = 'bg-orange-500';
  } else if (normalizedStatus.includes('contrato') || normalizedStatus.includes('preliminares')) {
    bgColor = 'bg-indigo-50';
    textColor = 'text-indigo-700';
    dotColor = 'bg-indigo-500';
  } else if (normalizedStatus.includes('em andamento') || normalizedStatus.includes('execucao')) {
    bgColor = 'bg-purple-50';
    textColor = 'text-purple-700';
    dotColor = 'bg-purple-500';
  } else if (normalizedStatus.includes('pagamento')) {
    bgColor = 'bg-emerald-50';
    textColor = 'text-emerald-700';
    dotColor = 'bg-emerald-500';
  } else if (normalizedStatus.includes('encerrada')) {
    bgColor = 'bg-stone-100';
    textColor = 'text-stone-500';
    dotColor = 'bg-stone-400';
  } else if (normalizedStatus.includes('cancelada') || normalizedStatus.includes('reprovad')) {
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
