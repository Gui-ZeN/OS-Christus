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
  recurrentLocation?: boolean;
  active?: boolean;
  onSelect: (id: string) => void;
}

const TicketListItemComponent: React.FC<TicketListItemProps> = ({
  id,
  subject,
  requester,
  time,
  status,
  priority,
  recurrentLocation,
  active,
  onSelect,
}) => {
  const normalizedRequester = repairMojibake(requester);
  const normalizedSubject = repairMojibake(subject);
  const normalizedPriority = priority ? repairMojibake(priority) : '';
  const isNew = status === TICKET_STATUS.NEW;
  const isWaitingValidation = status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL;

  return (
    <button
      onClick={() => onSelect(id)}
      aria-current={active ? 'true' : undefined}
      className={`w-full cursor-pointer border-b border-l-4 border-roman-border px-3 py-2.5 2xl:p-4 text-left transition-colors ${
        active
          ? 'border-l-roman-primary bg-roman-primary/20 ring-1 ring-inset ring-roman-primary/25 hover:bg-roman-primary/[0.22]'
          : isWaitingValidation
            ? 'border-l-roman-primary/45 bg-roman-primary/[0.06] hover:bg-roman-primary/12'
          : isNew
            ? 'border-l-roman-primary/45 bg-roman-primary/[0.06] hover:bg-roman-primary/12'
            : 'border-l-transparent hover:bg-roman-bg'
      }`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 pr-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${isNew ? 'bg-roman-danger' : 'bg-roman-success'}`}
            aria-hidden="true"
            title={isNew ? 'Nova OS — aguardando triagem' : 'OS em andamento'}
          />
          {/* 500, não 600. O 600 desta lista tem UM emprego: marcar qual OS está
              aberta (o assunto, logo abaixo). Com o solicitante sempre em 600, o peso
              da seleção competia com um que estava lá o tempo todo, e a marca de
              "é este que você abriu" ficava mais fraca do que devia. */}
          <span className="truncate text-sm font-medium text-roman-text-main 2xl:text-base">{normalizedRequester}</span>
        </div>
        <span className="whitespace-nowrap text-[11px] font-serif italic text-roman-text-sub">
          {formatDateTimeSafe(time)}
        </span>
      </div>

      <div className={`mb-1 truncate text-sm text-roman-text-main 2xl:text-base ${active ? 'font-semibold' : 'font-medium'}`}>
        <span className="font-normal text-roman-text-sub">{id}</span> · {normalizedSubject}
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-serif text-roman-text-sub">
        <StatusBadge status={status} compact />
        {priority && (
          <span
            className={`flex items-center gap-1 font-medium ${
              normalizedPriority === 'Urgente'
                ? 'text-roman-danger'
                : normalizedPriority === 'Alta'
                  ? 'text-roman-primary'
                  : 'text-roman-text-sub'
            }`}
          >
            {normalizedPriority === 'Urgente' && <AlertCircle size={14} />}
            {normalizedPriority}
          </span>
        )}
      </div>

      {isWaitingValidation && (
        <div className="mb-1.5 w-fit rounded-sm border border-roman-primary/35 bg-roman-primary/12 px-2 py-1 text-[11px] font-medium text-roman-text-main">
          Aguardando validação do solicitante
        </div>
      )}

      {recurrentLocation && (
        <div className="mb-1.5 w-fit rounded-sm border border-roman-primary/35 bg-roman-primary/12 px-2 py-1 text-[11px] font-medium text-roman-text-main">
          Local recorrente
        </div>
      )}
    </button>
  );
};

// Memoizado: a lista de tickets não re-renderiza a cada tecla no composer / poll;
// só re-renderiza o item cujos dados (ou `active`) mudaram. Requer `onSelect`
// estável no pai (useCallback).
export const TicketListItem = React.memo(TicketListItemComponent);


