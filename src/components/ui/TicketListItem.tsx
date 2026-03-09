import React from 'react';
import { AlertCircle, Clock, Eye } from 'lucide-react';
import { TICKET_STATUS } from '../../constants/ticketStatus';
import { SLAStatus } from '../../types';
import { formatDistanceToNowSafe } from '../../utils/date';
import { StatusBadge } from './StatusBadge';

interface TicketListItemProps {
  id: string;
  subject: string;
  requester: string;
  time: Date;
  status: string;
  priority?: string;
  viewingBy?: { name: string; at: Date } | null;
  sla?: SLAStatus;
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
  viewingBy,
  sla,
  active,
  onClick,
}) => {
  const isNew = status === TICKET_STATUS.NEW;

  return (
    <button
      onClick={onClick}
      className={`w-full cursor-pointer border-b border-roman-border p-4 text-left transition-colors ${
        active
          ? 'border-l-2 border-l-roman-primary bg-roman-bg'
          : isNew
            ? 'border-l-2 border-l-amber-500 bg-amber-50/50 hover:bg-amber-50'
            : 'border-l-2 border-l-transparent hover:bg-roman-bg'
      }`}
    >
      <div className="mb-1 flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-2 pr-2">
          {isNew && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
          <span className="truncate font-semibold text-roman-text-main">{requester}</span>
        </div>
        <span className="whitespace-nowrap text-xs font-serif italic text-roman-text-sub">
          {formatDistanceToNowSafe(time)}
        </span>
      </div>

      <div className="mb-2 truncate font-medium text-roman-text-main">{subject}</div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-serif text-roman-text-sub">
        <StatusBadge status={status} />
        <span className="opacity-50">•</span>
        {id}
        {priority && (
          <>
            <span className="opacity-50">•</span>
            <span
              className={`flex items-center gap-1 font-medium ${
                priority === 'Urgente'
                  ? 'text-red-600'
                  : priority === 'Alta'
                    ? 'text-orange-600'
                    : 'text-roman-text-sub'
              }`}
            >
              {priority === 'Urgente' && <AlertCircle size={10} />}
              {priority}
            </span>
          </>
        )}
        {sla && (
          <>
            <span className="opacity-50">•</span>
            <span
              className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-medium ${
                sla.status === 'overdue'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : sla.status === 'at_risk'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-green-200 bg-green-50 text-green-700'
              }`}
            >
              <Clock size={10} />
              {sla.status === 'overdue' ? 'Vencido' : sla.status === 'at_risk' ? 'Em risco' : 'No prazo'}
            </span>
          </>
        )}
      </div>

      {viewingBy && (
        <div className="animate-in fade-in flex w-fit items-center gap-1.5 rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
          <Eye size={10} />
          <span className="font-medium">Sendo visto por {viewingBy.name}</span>
        </div>
      )}
    </button>
  );
};
