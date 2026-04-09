import React from 'react';
import { AlertCircle } from 'lucide-react';
import { TICKET_STATUS } from '../../constants/ticketStatus';
import { formatDateTimeSafe } from '../../utils/date';
import { repairMojibake } from '../../utils/text';
import { StatusBadge } from './StatusBadge';

interface TicketListItemProps {
  id: string;
  subject: string;
  requester: string;
  time: Date;
  status: string;
  priority?: string;
  active?: boolean;
  onClick: () => void;
}

export const TicketListItem: React.FC<TicketListItemProps> = ({
  id,
  subject,
  requester,
  time,
  status,
  priority,
  active,
  onClick,
}) => {
  const normalizedRequester = repairMojibake(requester);
  const normalizedSubject = repairMojibake(subject);
  const normalizedPriority = priority ? repairMojibake(priority) : '';
  const isNew = status === TICKET_STATUS.NEW;
  const isWaitingValidation = status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL;

  return (
    <button
      onClick={onClick}
      className={`w-full cursor-pointer border-b border-roman-border p-3 xl:p-4 text-left transition-colors ${
        active
          ? 'border-l-2 border-l-roman-primary bg-roman-bg'
          : isWaitingValidation
            ? 'border-l-2 border-l-roman-primary bg-roman-primary/8 hover:bg-roman-primary/12'
          : isNew
            ? 'border-l-2 border-l-roman-primary bg-roman-primary/8 hover:bg-roman-primary/12'
            : 'border-l-2 border-l-transparent hover:bg-roman-bg'
      }`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 pr-2">
          {isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-roman-primary" aria-hidden="true" />}
          <span className="truncate text-[15px] font-semibold text-roman-text-main xl:text-base">{normalizedRequester}</span>
        </div>
        <span className="whitespace-nowrap text-[11px] font-serif italic text-roman-text-sub xl:text-xs">
          {formatDateTimeSafe(time)}
        </span>
      </div>

      <div className="mb-1.5 truncate text-[15px] font-medium text-roman-text-main xl:mb-2 xl:text-base">{normalizedSubject}</div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-serif text-roman-text-sub">
        <StatusBadge status={status} />
        <span className="opacity-50">•</span>
        {id}
        {priority && (
          <>
            <span className="opacity-50">•</span>
            <span
              className={`flex items-center gap-1 font-medium ${
                normalizedPriority === 'Urgente'
                  ? 'text-red-600'
                  : normalizedPriority === 'Alta'
                    ? 'text-roman-primary'
                    : 'text-roman-text-sub'
              }`}
            >
              {normalizedPriority === 'Urgente' && <AlertCircle size={10} />}
              {normalizedPriority}
            </span>
          </>
        )}
      </div>

      {isWaitingValidation && (
        <div className="mb-2 w-fit rounded-sm border border-roman-primary/35 bg-roman-primary/12 px-2 py-1 text-[10px] font-medium text-roman-primary">
          Aguardando validação do solicitante
        </div>
      )}
    </button>
  );
};


