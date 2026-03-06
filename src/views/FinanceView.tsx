import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, DollarSign, FileText, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { TICKET_STATUS } from '../constants/ticketStatus';
import type { PaymentRecord } from '../types';
import { fetchProcurementData, savePayment } from '../services/procurementApi';
import { formatDistanceToNowSafe } from '../utils/date';

export function FinanceView() {
  const { openAttachment, updateTicket, tickets, currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const canPay = canAccess;
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord>>({});

  if (!canAccess) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-8">
        <div className="max-w-4xl mx-auto min-h-[60vh]">
          <EmptyState
            icon={DollarSign}
            title="Acesso restrito"
            description="Apenas Diretor e Admin podem acessar o painel financeiro."
          />
        </div>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProcurementData();
        if (!cancelled) {
          setPaymentsByTicket(data.paymentsByTicket);
        }
      } catch {
        if (!cancelled) {
          setPaymentsByTicket({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const payments = useMemo(
    () =>
      tickets
        .filter(ticket => ticket.status === TICKET_STATUS.WAITING_PAYMENT)
        .map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          vendor: paymentsByTicket[ticket.id]?.vendor ?? 'Fornecedor a confirmar',
          value: paymentsByTicket[ticket.id]?.value ?? 'Valor a confirmar',
          receiptFileName: paymentsByTicket[ticket.id]?.receiptFileName ?? null,
          date: [...ticket.history].reverse().find(item => item.type === 'system' || item.type === 'customer')?.time ?? ticket.time,
        })),
    [paymentsByTicket, tickets]
  );

  const handlePay = (id: string) => {
    if (!canPay) return;
    setProcessingId(id);
    setTimeout(async () => {
      const currentPayment = paymentsByTicket[id];
      const nextPayment: PaymentRecord = {
        id: currentPayment?.id || 'payment-1',
        vendor: currentPayment?.vendor || 'Fornecedor a confirmar',
        value: currentPayment?.value || 'Valor a confirmar',
        status: 'paid',
        receiptFileName: currentPayment?.receiptFileName || null,
        paidAt: new Date(),
      };
      try {
        await savePayment(id, nextPayment);
      } catch {
        // Mantem o fluxo local mesmo se a API nao estiver disponivel no ambiente atual.
      }
      setPaymentsByTicket(prev => ({ ...prev, [id]: nextPayment }));
      setProcessingId(null);
      updateTicket(id, { status: TICKET_STATUS.CLOSED });
      setToast(`Pagamento confirmado. OS ${id} encerrada com sucesso.`);
      setTimeout(() => setToast(null), 3000);
    }, 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8 relative">
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in bg-green-800 text-white">
          <CheckCircle size={18} />
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}
      <div className="max-w-5xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Painel Financeiro</h1>
          <p className="text-roman-text-sub font-serif italic">Gestao de pagamentos de ordens de servico concluidas e validadas.</p>
        </header>

        <div className="space-y-4">
          {payments.map(payment => (
            <div key={payment.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 flex flex-col md:flex-row gap-6 items-start md:items-center shadow-sm relative overflow-hidden hover:border-roman-primary/30 transition-colors">
              {processingId === payment.id && (
                <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                  <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                  <span className="font-serif text-roman-text-main font-medium">Processando pagamento...</span>
                </div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-roman-primary font-serif italic text-sm">{payment.id}</span>
                  <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Pagamento</span>
                </div>
                <h3 className="text-xl font-serif text-roman-text-main mb-1">{payment.subject}</h3>
                <p className="text-sm text-roman-text-sub mb-4">Fornecedor: {payment.vendor} • Validacao: {formatDistanceToNowSafe(payment.date)}</p>
                <button onClick={() => openAttachment(`Nota Fiscal: ${payment.vendor}`, 'pdf')} className="flex items-center gap-2 text-roman-primary hover:underline text-sm font-medium">
                  <FileText size={16} /> Ver Nota Fiscal / Recibo
                </button>
              </div>

              <div className="w-full md:w-auto flex flex-col items-end gap-4 border-t md:border-t-0 md:border-l border-roman-border pt-4 md:pt-0 md:pl-6">
                <div className="text-right">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor a Pagar</div>
                  <div className="text-2xl font-serif text-roman-text-main">{payment.value}</div>
                </div>
                <button onClick={() => handlePay(payment.id)} disabled={!canPay} className="w-full px-6 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <DollarSign size={16} /> Confirmar Pagamento
                </button>
              </div>
            </div>
          ))}
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
