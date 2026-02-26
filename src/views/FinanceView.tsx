import React, { useState } from 'react';
import { CheckCircle, Loader2, FileText, DollarSign } from 'lucide-react';
import { formatDistanceToNow, subHours, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useApp } from '../context/AppContext';

export function FinanceView() {
  const { openAttachment, completedFinanceIds, setCompletedFinanceIds } = useApp();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const payments = [
    { id: 'OS-0040', subject: 'Troca do Carpete (Sala de Reuniões)', vendor: 'Decor Interiores', value: 'R$ 12.400,00', date: subHours(new Date(), 3) },
    { id: 'OS-0039', subject: 'Pintura Epóxi do Estacionamento Subsolo', vendor: 'Tintas Industriais S.A.', value: 'R$ 38.500,00', date: subDays(new Date(), 1) }
  ];

  const handlePay = (id: string) => {
    setProcessingId(id);
    setTimeout(() => {
      setProcessingId(null);
      setCompletedFinanceIds(prev => [...prev, id]);
    }, 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Painel Financeiro</h1>
          <p className="text-roman-text-sub font-serif italic">Gestão de pagamentos de Ordens de Serviço concluídas e validadas.</p>
        </header>

        <div className="space-y-4">
          {payments.map(p => {
            if (completedFinanceIds.includes(p.id)) {
              return (
                <div key={p.id} className="bg-green-50 border border-green-200 rounded-sm p-6 flex items-center justify-center gap-3 text-green-700 shadow-sm animate-in fade-in duration-500">
                  <CheckCircle size={24} />
                  <span className="font-medium text-lg font-serif">Pagamento confirmado para a {p.id}</span>
                </div>
              );
            }

            return (
              <div key={p.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 flex flex-col md:flex-row gap-6 items-start md:items-center shadow-sm relative overflow-hidden hover:border-roman-primary/30 transition-colors">
                {processingId === p.id && (
                  <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                    <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                    <span className="font-serif text-roman-text-main font-medium">Processando pagamento...</span>
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-roman-primary font-serif italic text-sm">{p.id}</span>
                    <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Pagamento</span>
                  </div>
                  <h3 className="text-xl font-serif text-roman-text-main mb-1">{p.subject}</h3>
                  <p className="text-sm text-roman-text-sub mb-4">Fornecedor: {p.vendor} • Validação: {formatDistanceToNow(p.date, { addSuffix: true, locale: ptBR })}</p>
                  
                  <button onClick={() => openAttachment(`Nota Fiscal: ${p.vendor}`, 'pdf')} className="flex items-center gap-2 text-roman-primary hover:underline text-sm font-medium">
                    <FileText size={16} /> Ver Nota Fiscal / Recibo
                  </button>
                </div>
                
                <div className="w-full md:w-auto flex flex-col items-end gap-4 border-t md:border-t-0 md:border-l border-roman-border pt-4 md:pt-0 md:pl-6">
                  <div className="text-right">
                    <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor a Pagar</div>
                    <div className="text-2xl font-serif text-roman-text-main">{p.value}</div>
                  </div>
                  <button onClick={() => handlePay(p.id)} className="w-full px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2">
                    <DollarSign size={16} /> Confirmar Pagamento
                  </button>
                </div>
              </div>
            );
          })}
          {payments.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-sm">
              <CheckCircle size={32} className="mx-auto text-roman-border mb-4" />
              <p className="text-roman-text-sub font-serif italic">Nenhum pagamento pendente no momento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
