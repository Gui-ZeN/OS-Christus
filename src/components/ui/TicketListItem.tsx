import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StatusBadge } from './StatusBadge';
import { AlertCircle, Eye, Clock } from 'lucide-react';
import { SLAStatus } from '../../types';

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

export const TicketListItem: React.FC<TicketListItemProps> = ({ id, subject, requester, time, status, priority, viewingBy, sla, active, onClick }) => {
  return (
    <button 
      onClick={onClick}
      className={`w-full text-left p-4 border-b border-roman-border cursor-pointer transition-colors ${active ? 'bg-roman-bg border-l-2 border-l-roman-primary' : 'hover:bg-roman-bg border-l-2 border-l-transparent'}`}
    >
      <div className="flex justify-between items-start mb-1">
        <span className="font-semibold text-roman-text-main truncate pr-2">{requester}</span>
        <span className="text-xs text-roman-text-sub font-serif italic whitespace-nowrap">
          {formatDistanceToNow(time, { addSuffix: true, locale: ptBR })}
        </span>
      </div>
      <div className="text-roman-text-main font-medium truncate mb-2">{subject}</div>
      
      <div className="flex flex-wrap items-center gap-2 text-xs text-roman-text-sub font-serif mb-2">
        <StatusBadge status={status} />
        <span className="opacity-50">•</span>
        {id}
        {priority && (
          <>
            <span className="opacity-50">•</span>
            <span className={`flex items-center gap-1 font-medium ${priority === 'Urgente' ? 'text-red-600' : priority === 'Alta' ? 'text-orange-600' : 'text-roman-text-sub'}`}>
              {priority === 'Urgente' && <AlertCircle size={10} />}
              {priority}
            </span>
          </>
        )}
        {sla && (
          <>
            <span className="opacity-50">•</span>
            <span className={`flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-sm border ${
              sla.status === 'overdue' ? 'bg-red-50 text-red-700 border-red-200' :
              sla.status === 'at_risk' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-green-50 text-green-700 border-green-200'
            }`}>
              <Clock size={10} />
              {sla.status === 'overdue' ? 'Vencido' : sla.status === 'at_risk' ? 'Em risco' : 'No prazo'}
            </span>
          </>
        )}
      </div>

      {viewingBy && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-sm w-fit animate-in fade-in">
          <Eye size={10} />
          <span className="font-medium">Sendo visto por {viewingBy.name}</span>
        </div>
      )}
    </button>
  );
}
