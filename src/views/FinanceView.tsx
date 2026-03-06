import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ClipboardList, DollarSign, FileText, Loader2, PlusCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { TICKET_STATUS } from '../constants/ticketStatus';
import type { ClosureChecklist, ContractRecord, GuaranteeInfo, MeasurementRecord, PaymentRecord } from '../types';
import { fetchProcurementData, saveMeasurement, savePayment } from '../services/procurementApi';
import { buildProcurementClassification } from '../utils/procurementClassification';
import { formatDistanceToNowSafe } from '../utils/date';

interface MeasurementFormState {
  label: string;
  progressPercent: string;
  releasePercent: string;
  notes: string;
}

interface ClosureFormState {
  requesterApproved: boolean;
  infrastructureApprovedByRafael: boolean;
  infrastructureApprovedByFernando: boolean;
  serviceStartedAt: string;
  serviceCompletedAt: string;
  guaranteeMonths: string;
  closureNotes: string;
}

function parseCurrency(value: string) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateLabel(date?: Date | null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Nao definido';
  return date.toLocaleDateString('pt-BR');
}

function formatInputDate(date?: Date | null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function sumReleasedPercent(payments: PaymentRecord[]) {
  return payments.reduce((total, payment) => total + Number(payment.releasedPercent || 0), 0);
}

function sumPaidValue(payments: PaymentRecord[]) {
  return payments
    .filter(payment => payment.status === 'paid')
    .reduce((total, payment) => total + parseCurrency(payment.value), 0);
}

function sumPlannedValue(payments: PaymentRecord[]) {
  return payments.reduce((total, payment) => total + parseCurrency(payment.value), 0);
}

function normalizeStatusLabel(status: string) {
  if (status === 'paid') return 'Pago';
  if (status === 'approved') return 'Aprovada';
  return 'Pendente';
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function createClosureFormState(closureChecklist?: ClosureChecklist, guarantee?: GuaranteeInfo): ClosureFormState {
  return {
    requesterApproved: closureChecklist?.requesterApproved ?? false,
    infrastructureApprovedByRafael: closureChecklist?.infrastructureApprovedByRafael ?? false,
    infrastructureApprovedByFernando: closureChecklist?.infrastructureApprovedByFernando ?? false,
    serviceStartedAt: formatInputDate(closureChecklist?.serviceStartedAt),
    serviceCompletedAt: formatInputDate(closureChecklist?.serviceCompletedAt),
    guaranteeMonths: String(guarantee?.months || 12),
    closureNotes: closureChecklist?.closureNotes || '',
  };
}

export function FinanceView() {
  const { openAttachment, updateTicket, tickets, currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const canPay = canAccess;
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord[]>>({});
  const [measurementsByTicket, setMeasurementsByTicket] = useState<Record<string, MeasurementRecord[]>>({});
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const [measurementDraftByTicket, setMeasurementDraftByTicket] = useState<Record<string, MeasurementFormState>>({});
  const [measurementFormOpen, setMeasurementFormOpen] = useState<Record<string, boolean>>({});
  const [closureDraftByTicket, setClosureDraftByTicket] = useState<Record<string, ClosureFormState>>({});

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
          setMeasurementsByTicket(data.measurementsByTicket);
          setContractsByTicket(data.contractsByTicket);
        }
      } catch {
        if (!cancelled) {
          setPaymentsByTicket({});
          setMeasurementsByTicket({});
          setContractsByTicket({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setClosureDraftByTicket(prev => {
      const next = { ...prev };
      for (const ticket of tickets) {
        const current = next[ticket.id];
        const seeded = createClosureFormState(ticket.closureChecklist, ticket.guarantee);
        next[ticket.id] = current
          ? {
              ...current,
              requesterApproved: current.requesterApproved || seeded.requesterApproved,
              serviceStartedAt: current.serviceStartedAt || seeded.serviceStartedAt,
              serviceCompletedAt: current.serviceCompletedAt || seeded.serviceCompletedAt,
            }
          : seeded;
      }
      return next;
    });
  }, [tickets]);

  const financeTickets = useMemo(
    () =>
      tickets
        .filter(ticket => ticket.status === TICKET_STATUS.WAITING_PAYMENT)
        .map(ticket => {
          const payments = paymentsByTicket[ticket.id] || [];
          const measurements = measurementsByTicket[ticket.id] || [];
          const contract = contractsByTicket[ticket.id];
          const totalValue = parseCurrency(contract?.value || payments[0]?.value || '0');
          const totalReleased = sumReleasedPercent(payments);
          const plannedValue = payments.length > 0 ? sumPlannedValue(payments) : totalValue;
          const paidValue = sumPaidValue(payments);
          const remainingValue = Math.max(0, plannedValue - paidValue);
          const pendingInstallments = payments.filter(payment => payment.status !== 'paid');
          const nextPendingInstallment = pendingInstallments[0] || null;

          return {
            ticket,
            payments,
            measurements,
            contract,
            totalValue,
            totalReleased,
            plannedValue,
            paidValue,
            remainingValue,
            pendingInstallments,
            nextPendingInstallment,
          };
        }),
    [contractsByTicket, measurementsByTicket, paymentsByTicket, tickets]
  );

  const getMeasurementDraft = (ticketId: string): MeasurementFormState =>
    measurementDraftByTicket[ticketId] || {
      label: '',
      progressPercent: '',
      releasePercent: '',
      notes: '',
    };

  const setMeasurementDraft = (ticketId: string, updates: Partial<MeasurementFormState>) => {
    setMeasurementDraftByTicket(prev => ({
      ...prev,
      [ticketId]: {
        ...getMeasurementDraft(ticketId),
        ...updates,
      },
    }));
  };

  const clearMeasurementDraft = (ticketId: string) => {
    setMeasurementDraftByTicket(prev => {
      const next = { ...prev };
      delete next[ticketId];
      return next;
    });
  };

  const getClosureDraft = (ticketId: string, closureChecklist?: ClosureChecklist, guarantee?: GuaranteeInfo): ClosureFormState =>
    closureDraftByTicket[ticketId] || createClosureFormState(closureChecklist, guarantee);

  const setClosureDraft = (ticketId: string, updates: Partial<ClosureFormState>) => {
    setClosureDraftByTicket(prev => ({
      ...prev,
      [ticketId]: {
        ...getClosureDraft(ticketId),
        ...updates,
      },
    }));
  };

  const generatePaymentPlan = async (ticketId: string, totalValue: number, vendor: string, parts: number) => {
    if (!canPay) return;
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    const existingPayments = paymentsByTicket[ticketId] || [];
    if (existingPayments.length > 0) {
      setToast('Erro: jÃ¡ existe um plano de pagamento cadastrado para esta OS.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (totalValue <= 0) {
      setToast('Erro: nÃ£o foi possÃ­vel calcular o valor total do contrato para gerar parcelas.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setProcessingId(ticketId);

    const baseValue = Math.floor((totalValue / parts) * 100) / 100;
    const installments = Array.from({ length: parts }, (_, index) => {
      const installmentNumber = index + 1;
      const isLast = installmentNumber === parts;
      const rawValue = isLast ? totalValue - baseValue * (parts - 1) : baseValue;
      const releasedPercent = installmentNumber === parts ? 100 - Math.round((100 / parts) * (parts - 1)) : Math.round(100 / parts);
      return {
        id: `payment-${installmentNumber}`,
        vendor,
        value: formatCurrency(rawValue),
        label: parts === 1 ? 'Pagamento Ã  vista' : `Parcela ${installmentNumber}/${parts}`,
        status: 'pending',
        installmentNumber,
        totalInstallments: parts,
        releasedPercent,
        dueAt: new Date(Date.now() + index * 7 * 24 * 60 * 60 * 1000),
        receiptFileName: null,
      } as PaymentRecord;
    });

    try {
      for (const installment of installments) {
        await savePayment(ticketId, installment, targetTicket ? buildProcurementClassification(targetTicket) : undefined);
      }
      setPaymentsByTicket(prev => ({ ...prev, [ticketId]: installments }));
      if (targetTicket) {
        updateTicket(ticketId, {
          history: [
            ...targetTicket.history,
            {
              id: crypto.randomUUID(),
              type: 'system',
              sender: 'Financeiro',
              time: new Date(),
              text: `Plano de pagamento gerado em ${parts} parcela(s) para ${vendor}.`,
            },
          ],
        });
      }
      setToast(`Plano de pagamento gerado em ${parts} parcela(s).`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddMeasurement = async (ticketId: string) => {
    const draft = getMeasurementDraft(ticketId);
    const progressPercent = Number(draft.progressPercent);
    const releasePercent = Number(draft.releasePercent);

    if (!draft.label.trim() || !Number.isFinite(progressPercent) || !Number.isFinite(releasePercent)) {
      setToast('Erro: informe descriÃ§Ã£o, percentual executado e percentual para liberaÃ§Ã£o.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const measurement: MeasurementRecord = {
      id: `measurement-${Date.now()}`,
      label: draft.label.trim(),
      progressPercent,
      releasePercent,
      status: 'approved',
      notes: draft.notes.trim(),
      requestedAt: new Date(),
      approvedAt: new Date(),
    };

    setProcessingId(ticketId);
    try {
      const targetTicket = tickets.find(ticket => ticket.id === ticketId);
      await saveMeasurement(ticketId, measurement, targetTicket ? buildProcurementClassification(targetTicket) : undefined);
      setMeasurementsByTicket(prev => ({
        ...prev,
        [ticketId]: [measurement, ...(prev[ticketId] || [])],
      }));
      if (targetTicket) {
        updateTicket(ticketId, {
          history: [
            ...targetTicket.history,
            {
              id: crypto.randomUUID(),
              type: 'system',
              sender: 'Rafael (Gestor)',
              time: new Date(),
              text: `MediÃ§Ã£o registrada: ${measurement.label} (${measurement.progressPercent}% executado, ${measurement.releasePercent}% para pagamento).`,
            },
          ],
        });
      }
      clearMeasurementDraft(ticketId);
      setMeasurementFormOpen(prev => ({ ...prev, [ticketId]: false }));
      setToast('MediÃ§Ã£o registrada com sucesso.');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessingId(null);
    }
  };

  const handlePayInstallment = async (ticketId: string, payment: PaymentRecord) => {
    if (!canPay) return;
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!targetTicket) return;

    const existingPayments = paymentsByTicket[ticketId] || [];
    const pendingPayments = existingPayments.filter(item => item.status !== 'paid');
    const isFinalInstallment = pendingPayments.length === 1 && pendingPayments[0].id === payment.id;
    const closureDraft = getClosureDraft(ticketId, targetTicket.closureChecklist, targetTicket.guarantee);

    if (isFinalInstallment) {
      const guaranteeMonths = Number(closureDraft.guaranteeMonths || 0);
      if (
        !closureDraft.requesterApproved ||
        !closureDraft.infrastructureApprovedByRafael ||
        !closureDraft.infrastructureApprovedByFernando ||
        !closureDraft.serviceStartedAt ||
        !closureDraft.serviceCompletedAt ||
        !Number.isFinite(guaranteeMonths) ||
        guaranteeMonths <= 0
      ) {
        setToast('Erro: preencha o checklist de encerramento e a garantia antes de quitar a Ãºltima parcela.');
        setTimeout(() => setToast(null), 3000);
        return;
      }
    }

    setProcessingId(`${ticketId}:${payment.id}`);
    try {
      const nextPayment: PaymentRecord = {
        ...payment,
        status: 'paid',
        paidAt: new Date(),
      };
      await savePayment(ticketId, nextPayment, buildProcurementClassification(targetTicket));
      const nextPayments = existingPayments.map(item => (item.id === payment.id ? nextPayment : item));
      setPaymentsByTicket(prev => ({ ...prev, [ticketId]: nextPayments }));

      const allPaid = nextPayments.every(item => item.status === 'paid');
      if (targetTicket) {
        const guaranteeMonths = Number(closureDraft.guaranteeMonths || 12);
        const serviceStartedAt = closureDraft.serviceStartedAt ? new Date(`${closureDraft.serviceStartedAt}T12:00:00`) : null;
        const serviceCompletedAt = closureDraft.serviceCompletedAt ? new Date(`${closureDraft.serviceCompletedAt}T12:00:00`) : null;
        const closedAt = allPaid ? new Date() : targetTicket.closureChecklist?.closedAt || null;
        const closureChecklist: ClosureChecklist | undefined = allPaid
          ? {
              requesterApproved: closureDraft.requesterApproved,
              requesterApprovedBy: targetTicket.closureChecklist?.requesterApprovedBy || targetTicket.requester,
              requesterApprovedAt: targetTicket.closureChecklist?.requesterApprovedAt || new Date(),
              infrastructureApprovedByRafael: closureDraft.infrastructureApprovedByRafael,
              infrastructureApprovedByFernando: closureDraft.infrastructureApprovedByFernando,
              closureNotes: closureDraft.closureNotes.trim(),
              serviceStartedAt,
              serviceCompletedAt,
              closedAt,
            }
          : targetTicket.closureChecklist;
        const guarantee: GuaranteeInfo | undefined = allPaid && serviceCompletedAt
          ? {
              startAt: serviceCompletedAt,
              endAt: addMonths(serviceCompletedAt, guaranteeMonths),
              months: guaranteeMonths,
              status: addMonths(serviceCompletedAt, guaranteeMonths).getTime() < Date.now() ? 'expired' : 'active',
            }
          : targetTicket.guarantee;

        updateTicket(ticketId, {
          status: allPaid ? TICKET_STATUS.CLOSED : TICKET_STATUS.WAITING_PAYMENT,
          closureChecklist,
          guarantee,
          history: [
            ...targetTicket.history,
            {
              id: crypto.randomUUID(),
              type: 'system',
              sender: 'Financeiro',
              time: new Date(),
              text: allPaid
                ? `${payment.label || 'Pagamento'} confirmado. Todas as parcelas foram quitadas, checklist concluÃ­do e garantia iniciada.`
                : `${payment.label || 'Pagamento'} confirmado. Restam ${nextPayments.filter(item => item.status !== 'paid').length} parcela(s) pendente(s).`,
            },
          ],
        });
      }
      setToast(
        allPaid
          ? `Pagamento final confirmado. OS ${ticketId} encerrada com sucesso.`
          : `${payment.label || 'Parcela'} confirmada.`
      );
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-8 relative">
      {toast && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in ${toast.includes('Erro') ? 'bg-red-800 text-white' : 'bg-green-800 text-white'}`}>
          <CheckCircle size={18} />
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-roman-border pb-4">
          <h1 className="text-3xl font-serif font-medium text-roman-text-main mb-2">Painel Financeiro</h1>
          <p className="text-roman-text-sub font-serif italic">MediÃ§Ãµes, geraÃ§Ã£o de parcelas e confirmaÃ§Ã£o de pagamentos das ordens de serviÃ§o validadas.</p>
        </header>

        <div className="space-y-5">
          {financeTickets.map(({ ticket, payments, measurements, contract, totalValue, totalReleased, plannedValue, paidValue, remainingValue, pendingInstallments, nextPendingInstallment }) => {
            const ticketProcessing = processingId === ticket.id || processingId?.startsWith(`${ticket.id}:`);
            const vendor = contract?.vendor || payments[0]?.vendor || 'Fornecedor a confirmar';
            const contractValue = contract?.value || payments[0]?.value || 'Valor a confirmar';
            const measurementDraft = getMeasurementDraft(ticket.id);
            const closureDraft = getClosureDraft(ticket.id, ticket.closureChecklist, ticket.guarantee);

            return (
              <div key={ticket.id} className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden">
                {ticketProcessing && (
                  <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-sm">
                    <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                    <span className="font-serif text-roman-text-main font-medium">Atualizando fluxo financeiro...</span>
                  </div>
                )}

                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1 space-y-5">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-roman-primary font-serif italic text-sm">{ticket.id}</span>
                        <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">Aguardando Pagamento</span>
                      </div>
                      <h3 className="text-xl font-serif text-roman-text-main mb-1">{ticket.subject}</h3>
                      {(ticket.macroServiceName || ticket.serviceCatalogName) && (
                        <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
                          {ticket.macroServiceName && (
                            <span className="rounded-sm border border-roman-primary/20 bg-roman-primary/5 px-2 py-1 text-roman-primary">
                              {ticket.macroServiceName}
                            </span>
                          )}
                          {ticket.serviceCatalogName && (
                            <span className="rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-roman-text-sub">
                              {ticket.serviceCatalogName}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-sm text-roman-text-sub">
                        Fornecedor: {vendor} | Contrato: {contractValue} | Validacao: {formatDistanceToNowSafe(ticket.time)}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor contratado</div>
                        <div className="text-lg font-serif text-roman-text-main">{contractValue}</div>
                      </div>
                      <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Previsto no plano</div>
                        <div className="text-lg font-serif text-roman-text-main">{formatCurrency(plannedValue)}</div>
                      </div>
                      <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Parcelas liberadas</div>
                        <div className="text-lg font-serif text-roman-text-main">{totalReleased}%</div>
                      </div>
                      <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">PrÃ³xima parcela</div>
                        <div className="text-lg font-serif text-roman-text-main">{nextPendingInstallment?.label || 'Nenhuma'}</div>
                      </div>
                    </div>

                    <section className="border border-roman-border rounded-sm p-4 bg-roman-bg/60">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-roman-text-main flex items-center gap-2"><DollarSign size={15} /> Previsto vs. pago</h4>
                          <p className="text-xs text-roman-text-sub mt-1">Conciliação simples entre contrato, plano gerado e parcelas efetivamente pagas.</p>
                        </div>
                        <div className={`text-xs font-medium px-2 py-1 rounded-sm border ${remainingValue > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                          {remainingValue > 0 ? 'Saldo pendente' : 'Quitado'}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor pago</div>
                          <div className="text-lg font-serif text-roman-text-main">{formatCurrency(paidValue)}</div>
                        </div>
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Saldo a pagar</div>
                          <div className="text-lg font-serif text-roman-text-main">{formatCurrency(remainingValue)}</div>
                        </div>
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Aderência ao contrato</div>
                          <div className="text-lg font-serif text-roman-text-main">
                            {totalValue > 0 ? `${Math.min(100, Math.round((paidValue / totalValue) * 100))}%` : '0%'}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="border border-roman-border rounded-sm p-4 bg-roman-bg/60">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-roman-text-main flex items-center gap-2"><ClipboardList size={15} /> MediÃ§Ãµes</h4>
                          <p className="text-xs text-roman-text-sub mt-1">Registre a evoluÃ§Ã£o da obra antes de solicitar pagamento.</p>
                        </div>
                        <button
                          onClick={() => setMeasurementFormOpen(prev => ({ ...prev, [ticket.id]: !prev[ticket.id] }))}
                          className="text-xs font-medium text-roman-primary hover:underline flex items-center gap-1"
                        >
                          <PlusCircle size={14} /> {measurementFormOpen[ticket.id] ? 'Fechar mediÃ§Ã£o' : 'Registrar mediÃ§Ã£o'}
                        </button>
                      </div>

                      {measurementFormOpen[ticket.id] && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 border border-roman-border rounded-sm p-3 bg-roman-surface">
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">DescriÃ§Ã£o da mediÃ§Ã£o</label>
                            <input
                              type="text"
                              value={measurementDraft.label}
                              onChange={e => setMeasurementDraft(ticket.id, { label: e.target.value })}
                              className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              placeholder="Ex: mediÃ§Ã£o 50% - cobertura e pintura"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">% executado</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={measurementDraft.progressPercent}
                              onChange={e => setMeasurementDraft(ticket.id, { progressPercent: e.target.value })}
                              className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">% para liberar</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={measurementDraft.releasePercent}
                              onChange={e => setMeasurementDraft(ticket.id, { releasePercent: e.target.value })}
                              className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">ObservaÃ§Ãµes</label>
                            <textarea
                              value={measurementDraft.notes}
                              onChange={e => setMeasurementDraft(ticket.id, { notes: e.target.value })}
                              className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
                              placeholder="Ex: relatÃ³rio com fotos enviado ao Pedro para liberaÃ§Ã£o."
                            />
                          </div>
                          <div className="md:col-span-2 flex justify-end">
                            <button
                              onClick={() => handleAddMeasurement(ticket.id)}
                              className="px-4 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm"
                            >
                              Salvar mediÃ§Ã£o
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {measurements.length === 0 ? (
                          <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma mediÃ§Ã£o registrada.</p>
                        ) : (
                          measurements.map(measurement => (
                            <div key={measurement.id} className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                <div>
                                  <div className="text-sm font-medium text-roman-text-main">{measurement.label}</div>
                                  <div className="text-xs text-roman-text-sub">
                                    {measurement.progressPercent}% executado | {measurement.releasePercent}% para pagamento | {normalizeStatusLabel(measurement.status)}
                                  </div>
                                </div>
                                <div className="text-xs text-roman-text-sub">
                                  {measurement.requestedAt ? `Registrada em ${formatDateLabel(measurement.requestedAt)}` : 'Sem data'}
                                </div>
                              </div>
                              {measurement.notes && <div className="mt-2 text-sm text-roman-text-sub">{measurement.notes}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    </section>

                    {contract?.items && contract.items.length > 0 && (
                      <section className="border border-roman-border rounded-sm p-4 bg-roman-bg/60">
                        <div className="mb-3">
                          <h4 className="text-sm font-semibold text-roman-text-main flex items-center gap-2"><FileText size={15} /> Escopo contratado</h4>
                          <p className="text-xs text-roman-text-sub mt-1">Itens aprovados na cotação vencedora e refletidos no contrato.</p>
                        </div>
                        <div className="space-y-2">
                          {contract.items.map(item => (
                            <div key={item.id} className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <div>
                                <div className="text-sm font-medium text-roman-text-main">{item.description || item.materialName || 'Item sem descrição'}</div>
                                <div className="text-xs text-roman-text-sub">
                                  {(item.quantity ?? '-')}{item.unit ? ` ${item.unit}` : ''} | unitário {item.unitPrice || '-'}
                                </div>
                              </div>
                              <div className="text-sm font-serif text-roman-text-main">{item.totalPrice || item.unitPrice || '-'}</div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <section className="border border-roman-border rounded-sm p-4 bg-roman-bg/60">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-roman-text-main flex items-center gap-2"><DollarSign size={15} /> Plano de pagamento</h4>
                          <p className="text-xs text-roman-text-sub mt-1">Gere parcelas padronizadas ou confirme as parcelas jÃ¡ liberadas.</p>
                        </div>
                        {payments.length === 0 && (
                          <div className="flex gap-2">
                            {[1, 2, 3, 4].map(parts => (
                              <button
                                key={parts}
                                onClick={() => generatePaymentPlan(ticket.id, totalValue, vendor, parts)}
                                className="px-3 py-1.5 border border-roman-border rounded-sm text-xs font-medium text-roman-text-main hover:border-roman-primary"
                              >
                                {parts === 1 ? 'Ã€ vista' : `${parts}x`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {payments.length === 0 ? (
                        <div className="text-sm text-roman-text-sub font-serif italic">
                          Nenhum plano gerado ainda. Use os atalhos acima para criar pagamento Ã  vista ou parcelado.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {payments.map(payment => (
                            <div key={payment.id} className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
                              <div>
                                <div className="text-sm font-medium text-roman-text-main">{payment.label || `Parcela ${payment.installmentNumber || 1}`}</div>
                                <div className="text-xs text-roman-text-sub">
                                  {payment.value} | {payment.releasedPercent || 0}% liberado | vencimento {formatDateLabel(payment.dueAt)}
                                </div>
                                {payment.paidAt && <div className="text-xs text-green-700 mt-1">Pago em {formatDateLabel(payment.paidAt)}</div>}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-medium px-2 py-1 rounded-sm border ${payment.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                  {payment.status === 'paid' ? 'Pago' : 'Pendente'}
                                </span>
                                <button
                                  onClick={() => handlePayInstallment(ticket.id, payment)}
                                  disabled={payment.status === 'paid' || !canPay}
                                  className="px-4 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <DollarSign size={15} /> Confirmar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="border border-roman-border rounded-sm p-4 bg-roman-bg/60">
                      <div className="mb-3">
                        <h4 className="text-sm font-semibold text-roman-text-main">Checklist de encerramento e garantia</h4>
                        <p className="text-xs text-roman-text-sub mt-1">A Ãºltima parcela sÃ³ pode ser quitada apÃ³s confirmaÃ§Ã£o da infraestrutura, do solicitante e definiÃ§Ã£o da garantia.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <label className={`flex items-center gap-3 p-3 border rounded-sm text-sm ${closureDraft.requesterApproved ? 'border-roman-primary bg-roman-primary/5 text-roman-primary' : 'border-roman-border text-roman-text-main'}`}>
                          <input
                            type="checkbox"
                            checked={closureDraft.requesterApproved}
                            onChange={e => setClosureDraft(ticket.id, { requesterApproved: e.target.checked })}
                          />
                          Solicitante confirmou a conclusÃ£o
                        </label>
                        <label className={`flex items-center gap-3 p-3 border rounded-sm text-sm ${closureDraft.infrastructureApprovedByRafael ? 'border-roman-primary bg-roman-primary/5 text-roman-primary' : 'border-roman-border text-roman-text-main'}`}>
                          <input
                            type="checkbox"
                            checked={closureDraft.infrastructureApprovedByRafael}
                            onChange={e => setClosureDraft(ticket.id, { infrastructureApprovedByRafael: e.target.checked })}
                          />
                          Infraestrutura aprovada por Rafael
                        </label>
                        <label className={`flex items-center gap-3 p-3 border rounded-sm text-sm ${closureDraft.infrastructureApprovedByFernando ? 'border-roman-primary bg-roman-primary/5 text-roman-primary' : 'border-roman-border text-roman-text-main'}`}>
                          <input
                            type="checkbox"
                            checked={closureDraft.infrastructureApprovedByFernando}
                            onChange={e => setClosureDraft(ticket.id, { infrastructureApprovedByFernando: e.target.checked })}
                          />
                          Infraestrutura aprovada por Fernando
                        </label>
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-3 py-3 text-xs text-roman-text-sub">
                          <div>Solicitante: {ticket.closureChecklist?.requesterApprovedBy || ticket.requester}</div>
                          <div>AprovaÃ§Ã£o registrada: {formatDateLabel(ticket.closureChecklist?.requesterApprovedAt)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                        <div>
                          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">InÃ­cio do serviÃ§o</label>
                          <input
                            type="date"
                            value={closureDraft.serviceStartedAt}
                            onChange={e => setClosureDraft(ticket.id, { serviceStartedAt: e.target.value })}
                            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">TÃ©rmino do serviÃ§o</label>
                          <input
                            type="date"
                            value={closureDraft.serviceCompletedAt}
                            onChange={e => setClosureDraft(ticket.id, { serviceCompletedAt: e.target.value })}
                            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Garantia (meses)</label>
                          <input
                            type="number"
                            min="1"
                            max="60"
                            value={closureDraft.guaranteeMonths}
                            onChange={e => setClosureDraft(ticket.id, { guaranteeMonths: e.target.value })}
                            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">ObservaÃ§Ãµes de encerramento</label>
                        <textarea
                          value={closureDraft.closureNotes}
                          onChange={e => setClosureDraft(ticket.id, { closureNotes: e.target.value })}
                          className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
                          placeholder="Ex: laudo final anexado, direÃ§Ã£o comunicada, garantia de 12 meses para estrutura."
                        />
                      </div>

                      {ticket.guarantee && (
                        <div className="mt-4 border border-roman-border rounded-sm bg-roman-surface px-3 py-3 text-xs text-roman-text-sub">
                          <div className="font-medium text-roman-text-main mb-1">Garantia atual</div>
                          <div>Status: {ticket.guarantee.status === 'active' ? 'Ativa' : ticket.guarantee.status === 'expired' ? 'Expirada' : 'Pendente'}</div>
                          <div>InÃ­cio: {formatDateLabel(ticket.guarantee.startAt)}</div>
                          <div>Fim: {formatDateLabel(ticket.guarantee.endAt)}</div>
                        </div>
                      )}
                    </section>
                  </div>

                  <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-roman-border pt-4 lg:pt-0 lg:pl-6">
                    <div className="space-y-3">
                      <button onClick={() => openAttachment(`Nota Fiscal: ${vendor}`, 'pdf')} className="w-full flex items-center justify-center gap-2 text-roman-primary border border-roman-border rounded-sm py-2 hover:border-roman-primary transition-colors text-sm font-medium">
                        <FileText size={16} /> Ver Nota Fiscal / Recibo
                      </button>
                      <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3 text-sm text-roman-text-sub">
                        <div className="font-medium text-roman-text-main mb-2">Resumo financeiro</div>
                        <div>Total do contrato: {contractValue}</div>
                        <div>Previsto no plano: {formatCurrency(plannedValue)}</div>
                        <div>Pago até agora: {formatCurrency(paidValue)}</div>
                        <div>Saldo pendente: {formatCurrency(remainingValue)}</div>
                        <div>Classificacao: {ticket.serviceCatalogName || ticket.macroServiceName || 'Nao definida'}</div>
                        <div>Parcelas pendentes: {pendingInstallments.length}</div>
                        <div>MediÃ§Ãµes registradas: {measurements.length}</div>
                        <div>Ãšltima atualizaÃ§Ã£o: {formatDistanceToNowSafe(ticket.time)}</div>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            );
          })}

          {financeTickets.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-sm">
              <CheckCircle size={32} className="mx-auto text-roman-border mb-4" />
              <p className="text-roman-text-sub font-serif italic">Nenhum fluxo financeiro pendente no momento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

