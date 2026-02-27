import React, { useState } from 'react';
import { ArrowRight, Landmark, CheckSquare, Loader2, CheckCircle, Users, Activity } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useApp } from '../context/AppContext';
import { HistoryItem } from '../types';

interface TrackingViewProps {
  ticketId: string;
  onBack: () => void;
}

export function TrackingView({ ticketId, onBack }: TrackingViewProps) {
  const { tickets, updateTicket } = useApp();
  const ticket = tickets.find(t => t.id === ticketId) ?? tickets[0];
  const [isProcessing, setIsProcessing] = useState(false);

  const handleValidate = (approved: boolean) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      const newStatus = approved ? 'Aguardando pagamento' : 'Em andamento';
      const newHistoryItem: HistoryItem = {
        id: uuidv4(),
        type: 'customer',
        sender: ticket.requester,
        time: new Date(),
        text: approved
          ? 'Manutenção aprovada pelo solicitante. Aguardando Geovana realizar o pagamento.'
          : 'Solicitante reportou pendências. Equipe técnica notificada para revisão.',
      };
      updateTicket(ticket.id, {
        status: newStatus,
        history: [...ticket.history, newHistoryItem],
      });
    }, 1500);
  };

  return (
    <div className="h-screen w-full bg-roman-bg overflow-y-auto flex flex-col items-center py-12 px-4 relative">
      {/* Back Button (Just for preview purposes) */}
      <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-roman-text-sub hover:text-roman-text-main font-medium transition-colors">
        <ArrowRight size={16} className="rotate-180" /> Voltar ao Sistema Interno
      </button>

      <div className="max-w-3xl w-full">
        {/* Header */}
        <div className="bg-roman-surface border border-roman-border p-8 rounded-sm shadow-sm mb-6">
          <div className="flex justify-between items-start mb-8 border-b border-roman-border pb-6">
            <div>
              <div className="text-roman-primary mb-4"><Landmark size={36} strokeWidth={1.5} /></div>
              <h1 className="text-2xl font-serif text-roman-text-main font-medium mb-1">Acompanhamento de OS</h1>
              <p className="text-roman-text-sub font-serif italic">Portal do Solicitante</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-serif text-roman-text-main font-medium">#{ticket.id}</div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-roman-primary/10 text-roman-primary border border-roman-primary/20 rounded-sm text-sm font-medium mt-2">
                <span className="w-2 h-2 rounded-full bg-roman-primary animate-pulse"></span> {ticket.status}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-serif text-roman-text-main mb-2">{ticket.subject}</h2>
            <p className="text-roman-text-sub">Solicitado por: {ticket.requester} • Setor: {ticket.sector} ({ticket.sede})</p>
          </div>

          {/* Validation Call to Action */}
          {ticket.status === 'Aguardando aprovação da manutenção' && (
            <div className="bg-roman-primary/10 border border-roman-primary/30 p-6 rounded-sm shadow-sm mb-8 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="font-serif text-lg font-medium text-roman-primary mb-2 flex items-center gap-2">
                <CheckSquare size={20} /> Validação da Manutenção
              </h3>
              <p className="text-sm text-roman-text-main mb-6">A equipe técnica informou que o serviço foi concluído. Por favor, verifique o local e confirme se o serviço está aprovado.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => handleValidate(false)} disabled={isProcessing} className="px-6 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm disabled:opacity-50">
                  Ainda com pendências (Reprovar)
                </button>
                <button onClick={() => handleValidate(true)} disabled={isProcessing} className="px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Serviço Aprovado (Encerrar)
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="font-serif text-lg font-medium text-roman-text-main mb-6">Histórico</h3>
            <div className="space-y-6 relative md:before:absolute md:before:inset-0 md:before:mx-auto md:before:translate-x-0 md:before:h-full md:before:w-0.5 md:before:bg-gradient-to-b md:before:from-transparent md:before:via-roman-border md:before:to-transparent">
              {ticket.history.filter(item => item.type !== 'field_change' && item.text).map((item, index) => (
                <div key={index} className="relative flex flex-col md:flex-row items-start md:items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active gap-4 md:gap-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-roman-surface text-roman-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 self-start md:self-center">
                    {item.type === 'customer' ? <Users size={16} /> : item.type === 'tech' ? <Activity size={16} /> : <CheckCircle size={16} />}
                  </div>
                  <div className="w-full md:w-[calc(50%-2.5rem)] bg-roman-surface border border-roman-border p-4 rounded-sm shadow-sm md:group-odd:text-right">
                    <div className="flex items-center justify-between md:group-odd:flex-row-reverse mb-1">
                      <div className="font-serif font-medium text-roman-text-main">{item.sender || 'Sistema'}</div>
                      {item.time && <div className="text-xs text-roman-text-sub font-serif italic">{formatDistanceToNow(item.time, { addSuffix: true, locale: ptBR })}</div>}
                    </div>
                    <div className="text-sm text-roman-text-main leading-relaxed">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
