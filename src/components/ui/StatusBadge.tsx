import React from 'react';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  let bgColor = 'bg-roman-bg';
  let textColor = 'text-roman-text-main';
  let dotColor = 'bg-roman-text-sub';
  let borderColor = 'border-roman-border';

  const normalizedStatus = status
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalizedStatus.includes('nova os')) {
    // Novo — azul (entrada)
    bgColor = 'bg-sky-50';
    textColor = 'text-sky-700';
    dotColor = 'bg-sky-500';
    borderColor = 'border-sky-200';
  } else if (normalizedStatus.includes('aguardando parecer') || normalizedStatus.includes('aguardando aprovacao da solucao')) {
    // Triagem / aprovação técnica — violeta
    bgColor = 'bg-violet-50';
    textColor = 'text-violet-700';
    dotColor = 'bg-violet-500';
    borderColor = 'border-violet-200';
  } else if (normalizedStatus.includes('orcamento') || normalizedStatus.includes('cotacao')) {
    // Orçamento — âmbar
    bgColor = 'bg-amber-50';
    textColor = 'text-amber-700';
    dotColor = 'bg-amber-500';
    borderColor = 'border-amber-200';
  } else if (normalizedStatus.includes('contrato') || normalizedStatus.includes('preliminares')) {
    // Contrato / ações preliminares — laranja
    bgColor = 'bg-orange-50';
    textColor = 'text-orange-700';
    dotColor = 'bg-orange-500';
    borderColor = 'border-orange-200';
  } else if (normalizedStatus.includes('em andamento') || normalizedStatus.includes('execucao')) {
    // Em execução — esmeralda (em curso)
    bgColor = 'bg-emerald-50';
    textColor = 'text-emerald-700';
    dotColor = 'bg-emerald-500';
    borderColor = 'border-emerald-200';
  } else if (normalizedStatus.includes('validacao') || normalizedStatus.includes('manutencao')) {
    // Aguardando validação do solicitante — cyan
    bgColor = 'bg-cyan-50';
    textColor = 'text-cyan-700';
    dotColor = 'bg-cyan-500';
    borderColor = 'border-cyan-200';
  } else if (normalizedStatus.includes('pagamento')) {
    // Pagamento — azul-índigo
    bgColor = 'bg-indigo-50';
    textColor = 'text-indigo-700';
    dotColor = 'bg-indigo-500';
    borderColor = 'border-indigo-200';
  } else if (normalizedStatus.includes('encerrada')) {
    bgColor = 'bg-roman-border-light';
    textColor = 'text-roman-text-sub';
    dotColor = 'bg-roman-text-sub';
  } else if (normalizedStatus.includes('cancelada') || normalizedStatus.includes('reprovad')) {
    bgColor = 'bg-red-50';
    textColor = 'text-red-700';
    dotColor = 'bg-red-500';
    borderColor = 'border-red-200';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${borderColor} px-2.5 py-1 text-xs font-medium ${bgColor} ${textColor} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} aria-hidden="true"></span>
      {status}
    </span>
  );
}
