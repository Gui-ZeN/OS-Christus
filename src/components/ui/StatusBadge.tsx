import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  let bgColor = 'bg-roman-bg';
  let textColor = 'text-roman-text-main';
  let dotColor = 'bg-roman-text-sub';

  const normalizedStatus = status
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalizedStatus.includes('nova os')) {
    bgColor = 'bg-roman-primary/12';
    textColor = 'text-roman-primary';
    dotColor = 'bg-roman-primary';
  } else if (normalizedStatus.includes('aguardando parecer') || normalizedStatus.includes('aguardando aprovacao')) {
    bgColor = 'bg-roman-primary/12';
    textColor = 'text-roman-primary';
    dotColor = 'bg-roman-primary';
  } else if (normalizedStatus.includes('orcamento') || normalizedStatus.includes('cotacao')) {
    bgColor = 'bg-roman-primary/12';
    textColor = 'text-roman-primary';
    dotColor = 'bg-roman-primary';
  } else if (normalizedStatus.includes('contrato') || normalizedStatus.includes('preliminares')) {
    bgColor = 'bg-roman-primary/12';
    textColor = 'text-roman-primary';
    dotColor = 'bg-roman-primary';
  } else if (normalizedStatus.includes('em andamento') || normalizedStatus.includes('execucao')) {
    bgColor = 'bg-roman-primary/12';
    textColor = 'text-roman-primary';
    dotColor = 'bg-roman-primary';
  } else if (normalizedStatus.includes('pagamento')) {
    bgColor = 'bg-roman-primary/12';
    textColor = 'text-roman-primary';
    dotColor = 'bg-roman-primary';
  } else if (normalizedStatus.includes('encerrada')) {
    bgColor = 'bg-roman-border-light';
    textColor = 'text-roman-text-sub';
    dotColor = 'bg-roman-text-sub';
  } else if (normalizedStatus.includes('cancelada') || normalizedStatus.includes('reprovad')) {
    bgColor = 'bg-red-50';
    textColor = 'text-red-700';
    dotColor = 'bg-red-500';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-roman-border px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`}></span>
      {status}
    </span>
  );
}
