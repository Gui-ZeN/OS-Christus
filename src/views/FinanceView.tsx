import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ChevronDown, ClipboardList, DollarSign, FileText, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import type { ClosureChecklist, ContractRecord, GuaranteeInfo, MeasurementRecord, PaymentRecord, Ticket } from '../types';
import { fetchProcurementData, saveMeasurement, savePayment } from '../services/procurementApi';
import { deleteTicketAttachment, uploadClosureDocument } from '../services/ticketStorage';
import { buildValidationClosureChecklist } from '../utils/closureChecklist';
import { applyProgressToPayments, createExecutionPaymentPlan, getApprovedPaymentValue, getApprovedReleasePercent, getNextMilestonePercent, getPaymentFlowMilestones } from '../utils/executionFlow';
import { buildProcurementClassification } from '../utils/procurementClassification';
import { formatDateTimeSafe } from '../utils/date';
import { getTicketRegionLabel, getTicketSiteLabel } from '../utils/ticketTerritory';

interface MeasurementFormState {
  label: string;
  progressPercent: string;
  notes: string;
}

interface ClosureFormState {
  requesterApproved: boolean;
  infrastructureApprovalPrimary: boolean;
  infrastructureApprovalSecondary: boolean;
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
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Não definido';
  return date.toLocaleDateString('pt-BR');
}

function formatInputDate(date?: Date | null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function sumReleasedPercent(payments: PaymentRecord[]) {
  return getApprovedReleasePercent(payments);
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
  if (status === 'approved') return 'Liberada';
  return 'Pendente';
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function FinanceSection({
  title,
  description,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-roman-border bg-roman-bg/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-roman-text-main">
            {icon}
            <span>{title}</span>
          </div>
          {description ? <p className="mt-1 text-xs text-roman-text-sub">{description}</p> : null}
        </div>
        <ChevronDown size={16} className="shrink-0 text-roman-text-sub" />
      </summary>
      <div className="border-t border-roman-border px-4 py-4">{children}</div>
    </details>
  );
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildClosureExportHtml(
  ticket: Ticket,
  contract: ContractRecord | undefined,
  measurements: MeasurementRecord[],
  payments: PaymentRecord[],
  plannedValue: number,
  paidValue: number,
  regions: CatalogRegion[],
  sites: CatalogSite[]
) {
  const closureDocuments = ticket.closureChecklist?.documents || [];
  const contractItems = contract?.items || [];
  const siteLabel = getTicketSiteLabel(ticket, sites);
  const regionLabel = getTicketRegionLabel(ticket, regions, sites);

  const measurementRows = measurements.length === 0
    ? '<tr><td colspan="4">Nenhuma medição registrada.</td></tr>'
    : measurements
        .map(
          measurement => `
            <tr>
              <td>${escapeHtml(measurement.label)}</td>
              <td>${measurement.progressPercent}%</td>
              <td>${measurement.releasePercent}%</td>
              <td>${escapeHtml(formatDateLabel(measurement.requestedAt))}</td>
            </tr>
          `
        )
        .join('');

  const paymentRows = payments.length === 0
    ? '<tr><td colspan="5">Nenhuma parcela registrada.</td></tr>'
    : payments
        .map(
          payment => `
            <tr>
              <td>${escapeHtml(payment.label || `Parcela ${payment.installmentNumber || '-'}`)}</td>
              <td>${escapeHtml(payment.value)}</td>
              <td>${payment.releasedPercent || 0}%</td>
              <td>${payment.status === 'paid' ? 'Pago' : payment.status === 'approved' ? 'Liberada' : 'Pendente'}</td>
              <td>${escapeHtml(formatDateLabel(payment.paidAt || payment.dueAt))}</td>
            </tr>
          `
        )
        .join('');

  const contractRows = contractItems.length === 0
    ? '<tr><td colspan="4">Escopo contratado não informado.</td></tr>'
    : contractItems
        .map(
          item => `
            <tr>
              <td>${escapeHtml(item.description || item.materialName || 'Item sem descrição')}</td>
              <td>${escapeHtml(String(item.quantity ?? '-'))} ${escapeHtml(item.unit || '')}</td>
              <td>${escapeHtml(item.unitPrice || '-')}</td>
              <td>${escapeHtml(item.totalPrice || item.unitPrice || '-')}</td>
            </tr>
          `
        )
        .join('');

  const documentRows = closureDocuments.length === 0
    ? '<li>Nenhum laudo anexado.</li>'
    : closureDocuments
        .map(
          document => `
            <li>
              <a href="${escapeHtml(document.url)}" target="_blank" rel="noreferrer">${escapeHtml(document.name)}</a>
              - ${escapeHtml(formatDateLabel(document.uploadedAt))}
            </li>
          `
        )
        .join('');

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <title>Encerramento ${escapeHtml(ticket.id)}</title>
      <style>
        body { font-family: Georgia, serif; color: #1f1712; margin: 32px; line-height: 1.5; }
        h1, h2, h3 { margin: 0 0 12px; }
        h1 { font-size: 28px; }
        h2 { font-size: 18px; border-bottom: 1px solid #d6cdc4; padding-bottom: 6px; margin-top: 28px; }
        .meta, .grid { display: grid; gap: 12px; }
        .meta { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 18px; }
        .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .card { border: 1px solid #d6cdc4; padding: 12px; border-radius: 4px; background: #faf7f2; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #d6cdc4; padding: 8px; text-align: left; font-size: 13px; vertical-align: top; }
        th { background: #f2ece4; }
        ul { padding-left: 18px; }
        .muted { color: #6f6257; }
      </style>
    </head>
    <body>
      <h1>Encerramento da Ordem de Serviço ${escapeHtml(ticket.id)}</h1>
      <div class="meta">
        <div><strong>Assunto:</strong> ${escapeHtml(ticket.subject)}</div>
        <div><strong>Status:</strong> ${escapeHtml(ticket.status)}</div>
        <div><strong>Solicitante:</strong> ${escapeHtml(ticket.requester)}</div>
        <div><strong>Sede:</strong> ${escapeHtml(siteLabel)}</div>
        <div><strong>Região:</strong> ${escapeHtml(regionLabel)}</div>
        <div><strong>Classificação:</strong> ${escapeHtml(ticket.serviceCatalogName || ticket.macroServiceName || 'Não definida')}</div>
      </div>

      <div class="grid">
        <div class="card"><strong>Fornecedor</strong><br />${escapeHtml(contract?.vendor || payments[0]?.vendor || 'Não definido')}</div>
        <div class="card"><strong>Previsto</strong><br />${escapeHtml(formatCurrency(plannedValue))}</div>
        <div class="card"><strong>Pago</strong><br />${escapeHtml(formatCurrency(paidValue))}</div>
      </div>

      <h2>Encerramento e garantia</h2>
      <div class="meta">
        <div><strong>Início do serviço:</strong> ${escapeHtml(formatDateLabel(ticket.closureChecklist?.serviceStartedAt))}</div>
        <div><strong>Término do serviço:</strong> ${escapeHtml(formatDateLabel(ticket.closureChecklist?.serviceCompletedAt))}</div>
        <div><strong>Solicitante aprovou:</strong> ${ticket.closureChecklist?.requesterApproved ? 'Sim' : 'Não'}</div>
        <div><strong>Aprovação técnica 1:</strong> ${ticket.closureChecklist?.infrastructureApprovalPrimary ? 'Sim' : 'Não'}</div>
        <div><strong>Aprovação técnica 2:</strong> ${ticket.closureChecklist?.infrastructureApprovalSecondary ? 'Sim' : 'Não'}</div>
        <div><strong>Garantia:</strong> ${escapeHtml(formatDateLabel(ticket.guarantee?.startAt))} até ${escapeHtml(formatDateLabel(ticket.guarantee?.endAt))}</div>
      </div>
      <div class="card"><strong>Observações finais</strong><br /><span class="muted">${escapeHtml(ticket.closureChecklist?.closureNotes || 'Sem observações registradas.')}</span></div>

      <h2>Escopo contratado</h2>
      <table>
        <thead>
          <tr><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Valor total</th></tr>
        </thead>
        <tbody>${contractRows}</tbody>
      </table>

      <h2>Medições</h2>
      <table>
        <thead>
          <tr><th>Descrição</th><th>% executado</th><th>% liberado</th><th>Data</th></tr>
        </thead>
        <tbody>${measurementRows}</tbody>
      </table>

      <h2>Pagamentos</h2>
      <table>
        <thead>
          <tr><th>Parcela</th><th>Valor</th><th>% liberado</th><th>Status</th><th>Data</th></tr>
        </thead>
        <tbody>${paymentRows}</tbody>
      </table>

      <h2>Laudos e anexos</h2>
      <ul>${documentRows}</ul>
    </body>
  </html>`;
}

function createClosureFormState(closureChecklist?: ClosureChecklist, guarantee?: GuaranteeInfo): ClosureFormState {
  return {
    requesterApproved: closureChecklist?.requesterApproved ?? false,
    infrastructureApprovalPrimary: closureChecklist?.infrastructureApprovalPrimary ?? false,
    infrastructureApprovalSecondary: closureChecklist?.infrastructureApprovalSecondary ?? false,
    serviceStartedAt: formatInputDate(closureChecklist?.serviceStartedAt),
    serviceCompletedAt: formatInputDate(closureChecklist?.serviceCompletedAt),
    guaranteeMonths: String(guarantee?.months || 12),
    closureNotes: closureChecklist?.closureNotes || '',
  };
}

function getFinalInstallmentBlockingReasons(closureDraft: ClosureFormState) {
  const reasons: string[] = [];
  const guaranteeMonths = Number(closureDraft.guaranteeMonths || 0);

  if (!closureDraft.requesterApproved) reasons.push('Solicitante ainda não confirmou a conclusão');
  if (!closureDraft.infrastructureApprovalPrimary) reasons.push('Aprovação técnica 1 pendente');
  if (!closureDraft.infrastructureApprovalSecondary) reasons.push('Aprovação técnica 2 pendente');
  if (!closureDraft.serviceStartedAt) reasons.push('Início do serviço não informado');
  if (!closureDraft.serviceCompletedAt) reasons.push('Término do serviço não informado');
  if (!Number.isFinite(guaranteeMonths) || guaranteeMonths <= 0) reasons.push('Garantia inválida');

  return reasons;
}

export function FinanceView() {
  const { activeTicketId, currentView, openAttachment, updateTicket, tickets, currentUser } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const canPay = canAccess;
  const actorLabel = currentUser?.role ? `${currentUser.name} (${currentUser.role})` : currentUser?.name || 'Financeiro';
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord[]>>({});
  const [measurementsByTicket, setMeasurementsByTicket] = useState<Record<string, MeasurementRecord[]>>({});
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [measurementDraftByTicket, setMeasurementDraftByTicket] = useState<Record<string, MeasurementFormState>>({});
  const [measurementFormOpen, setMeasurementFormOpen] = useState<Record<string, boolean>>({});
  const [closureDraftByTicket, setClosureDraftByTicket] = useState<Record<string, ClosureFormState>>({});
  const [uploadingTicketId, setUploadingTicketId] = useState<string | null>(null);
  const [financeSection, setFinanceSection] = useState<'open' | 'history'>('open');
  const [collapsedTickets, setCollapsedTickets] = useState<Record<string, boolean>>({});

  if (!canAccess) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-8">
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
        const catalog = await fetchCatalog();
        const data = await fetchProcurementData();
        if (!cancelled) {
          setRegions(catalog.regions);
          setSites(catalog.sites);
          setPaymentsByTicket(data.paymentsByTicket);
          setMeasurementsByTicket(data.measurementsByTicket);
          setContractsByTicket(data.contractsByTicket);
        }
      } catch {
        if (!cancelled) {
          setRegions([]);
          setSites([]);
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
        .filter(ticket => {
          const hasFinancialContext =
            Boolean(ticket.executionProgress?.paymentFlowParts) ||
            Boolean(contractsByTicket[ticket.id]) ||
            (paymentsByTicket[ticket.id]?.length || 0) > 0 ||
            (measurementsByTicket[ticket.id]?.length || 0) > 0;

          return hasFinancialContext && [
            TICKET_STATUS.IN_PROGRESS,
            TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL,
            TICKET_STATUS.WAITING_PAYMENT,
            TICKET_STATUS.CLOSED,
          ].includes(ticket.status);
        })
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
          const nextMilestonePercent = getNextMilestonePercent(payments);

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
            nextMilestonePercent,
          };
        }),
    [contractsByTicket, measurementsByTicket, paymentsByTicket, tickets]
  );

  const financeSummary = useMemo(() => {
    return financeTickets.reduce(
      (acc, entry) => {
        acc.tickets += 1;
        acc.planned += entry.plannedValue;
        acc.paid += entry.paidValue;
        acc.remaining += entry.remainingValue;
        return acc;
      },
      { tickets: 0, planned: 0, paid: 0, remaining: 0 }
    );
  }, [financeTickets]);

  const openFinanceTickets = useMemo(
    () =>
      financeTickets.filter(entry => {
        const fullyPaid = entry.payments.length > 0 && entry.payments.every(payment => payment.status === 'paid');
        return !(fullyPaid && entry.remainingValue <= 0);
      }),
    [financeTickets]
  );

  const historicalFinanceTickets = useMemo(
    () =>
      financeTickets.filter(entry => {
        const fullyPaid = entry.payments.length > 0 && entry.payments.every(payment => payment.status === 'paid');
        return fullyPaid && entry.remainingValue <= 0;
      }),
    [financeTickets]
  );

  const visibleFinanceTickets = financeSection === 'open' ? openFinanceTickets : historicalFinanceTickets;

  useEffect(() => {
    if (currentView !== 'finance' || !activeTicketId) return;
    if (!visibleFinanceTickets.some(entry => entry.ticket.id === activeTicketId)) return;
    window.setTimeout(() => {
      document.getElementById(`finance-ticket-${activeTicketId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, [activeTicketId, currentView, visibleFinanceTickets]);

  useEffect(() => {
    setCollapsedTickets(prev => {
      const next = { ...prev };
      for (const entry of financeTickets) {
        if (!(entry.ticket.id in next)) {
          next[entry.ticket.id] = financeSection === 'history';
        }
      }
      return next;
    });
  }, [financeSection, financeTickets]);

  const getMeasurementDraft = (ticketId: string): MeasurementFormState =>
    measurementDraftByTicket[ticketId] || {
      label: '',
      progressPercent: '',
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

  const getMeasurementReleasePreview = (ticket: Ticket, progressInput: string) => {
    const progressPercent = Number(progressInput);
    if (!Number.isFinite(progressPercent) || !ticket.executionProgress?.paymentFlowParts) {
      return 0;
    }

    const existingPayments = paymentsByTicket[ticket.id] || [];
    const contractValue = parseCurrency(contractsByTicket[ticket.id]?.value || existingPayments[0]?.value || '0');
    const vendor = contractsByTicket[ticket.id]?.vendor || existingPayments[0]?.vendor || ticket.assignedTeam || 'Fornecedor não definido';
    const baselinePayments =
      existingPayments.length > 0
        ? existingPayments
        : contractValue > 0
          ? createExecutionPaymentPlan(contractValue, vendor, ticket.executionProgress.paymentFlowParts)
          : [];
    const { newlyApproved } = applyProgressToPayments(baselinePayments, progressPercent);
    return newlyApproved.reduce((total, payment) => total + Number(payment.releasedPercent || 0), 0);
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

  const handleClosureDocumentUpload = async (ticketId: string, file: File | null) => {
    if (!file) return;
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!targetTicket) return;

    setUploadingTicketId(ticketId);
    try {
      const uploaded = await uploadClosureDocument(ticketId, file);
      const currentDocuments = targetTicket.closureChecklist?.documents || [];
      updateTicket(ticketId, {
        closureChecklist: {
          requesterApproved: targetTicket.closureChecklist?.requesterApproved ?? false,
          requesterApprovedBy: targetTicket.closureChecklist?.requesterApprovedBy || null,
          requesterApprovedAt: targetTicket.closureChecklist?.requesterApprovedAt || null,
          infrastructureApprovalPrimary: targetTicket.closureChecklist?.infrastructureApprovalPrimary ?? false,
          infrastructureApprovalSecondary: targetTicket.closureChecklist?.infrastructureApprovalSecondary ?? false,
          closureNotes: targetTicket.closureChecklist?.closureNotes || '',
          serviceStartedAt: targetTicket.closureChecklist?.serviceStartedAt || null,
          serviceCompletedAt: targetTicket.closureChecklist?.serviceCompletedAt || null,
          closedAt: targetTicket.closureChecklist?.closedAt || null,
          documents: [uploaded, ...currentDocuments],
        },
        history: [
          ...targetTicket.history,
          {
            id: crypto.randomUUID(),
            type: 'system',
            sender: 'Financeiro',
            time: new Date(),
            text: `Documento de encerramento anexado: ${uploaded.name}.`,
          },
        ],
      });
      setToast(`Documento ${uploaded.name} anexado com sucesso.`);
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      setToast(`Erro: ${error instanceof Error ? error.message : 'falha no upload do documento.'}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setUploadingTicketId(null);
    }
  };

  const handleClosureDocumentRemove = async (ticketId: string, documentId: string) => {
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!targetTicket) return;

    const currentDocuments = targetTicket.closureChecklist?.documents || [];
    const targetDocument = currentDocuments.find(document => document.id === documentId);
    if (!targetDocument) return;

    setUploadingTicketId(ticketId);
    try {
      await deleteTicketAttachment(targetDocument.path);
      const nextDocuments = currentDocuments.filter(document => document.id !== documentId);
      updateTicket(ticketId, {
        closureChecklist: {
          requesterApproved: targetTicket.closureChecklist?.requesterApproved ?? false,
          requesterApprovedBy: targetTicket.closureChecklist?.requesterApprovedBy || null,
          requesterApprovedAt: targetTicket.closureChecklist?.requesterApprovedAt || null,
          infrastructureApprovalPrimary: targetTicket.closureChecklist?.infrastructureApprovalPrimary ?? false,
          infrastructureApprovalSecondary: targetTicket.closureChecklist?.infrastructureApprovalSecondary ?? false,
          closureNotes: targetTicket.closureChecklist?.closureNotes || '',
          serviceStartedAt: targetTicket.closureChecklist?.serviceStartedAt || null,
          serviceCompletedAt: targetTicket.closureChecklist?.serviceCompletedAt || null,
          closedAt: targetTicket.closureChecklist?.closedAt || null,
          documents: nextDocuments,
        },
        history: [
          ...targetTicket.history,
          {
            id: crypto.randomUUID(),
            type: 'system',
            sender: 'Financeiro',
            time: new Date(),
            text: `Documento de encerramento removido: ${targetDocument.name}.`,
          },
        ],
      });
      setToast(`Documento ${targetDocument.name} removido com sucesso.`);
      setTimeout(() => setToast(null), 3000);
    } catch (error) {
      setToast(`Erro: ${error instanceof Error ? error.message : 'falha ao remover o documento.'}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setUploadingTicketId(null);
    }
  };

  const handleExportClosureHtml = (
    ticket: Ticket,
    contract: ContractRecord | undefined,
    measurements: MeasurementRecord[],
    payments: PaymentRecord[],
    plannedValue: number,
    paidValue: number
  ) => {
    const html = buildClosureExportHtml(ticket, contract, measurements, payments, plannedValue, paidValue, regions, sites);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${ticket.id}-encerramento.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrintClosure = (
    ticket: Ticket,
    contract: ContractRecord | undefined,
    measurements: MeasurementRecord[],
    payments: PaymentRecord[],
    plannedValue: number,
    paidValue: number
  ) => {
    const html = buildClosureExportHtml(ticket, contract, measurements, payments, plannedValue, paidValue, regions, sites);
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
    if (!printWindow) {
      setToast('Erro: não foi possível abrir a janela de impressão.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const generatePaymentPlan = async (ticketId: string, totalValue: number, vendor: string, parts: number) => {
    if (!canPay) return;
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    const existingPayments = paymentsByTicket[ticketId] || [];
    if (existingPayments.length > 0) {
      setToast('Erro: já existe um plano de pagamento cadastrado para esta OS.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (totalValue <= 0) {
      setToast('Erro: não foi possível calcular o valor total do contrato para gerar parcelas.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setProcessingId(ticketId);
    const installments = createExecutionPaymentPlan(totalValue, vendor, parts);

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
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);

    if (!targetTicket) return;

    if (!Number.isFinite(progressPercent)) {
      setToast('Erro: informe o percentual atual de andamento da obra.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (progressPercent < 0 || progressPercent > 100) {
      setToast('Erro: o andamento precisa ficar entre 0% e 100%.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (!targetTicket.executionProgress?.paymentFlowParts) {
      setToast('Erro: inicie a execução e defina o fluxo de pagamento antes de registrar o andamento.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const contractValue = parseCurrency(contractsByTicket[ticketId]?.value || paymentsByTicket[ticketId]?.[0]?.value || '0');
    if (contractValue <= 0) {
      setToast('Erro: não foi possível calcular o valor do contrato para liberar pagamentos.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const vendor =
      contractsByTicket[ticketId]?.vendor ||
      paymentsByTicket[ticketId]?.[0]?.vendor ||
      targetTicket.assignedTeam ||
      'Fornecedor não definido';
    const existingPayments = paymentsByTicket[ticketId] || [];
    const currentProgress = Number(targetTicket.executionProgress?.currentPercent || 0);

    if (progressPercent < currentProgress) {
      setToast('Erro: o andamento informado é menor do que o percentual já registrado.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    let baselinePayments = existingPayments;
    const createdPlan = baselinePayments.length === 0;
    if (createdPlan) {
      baselinePayments = createExecutionPaymentPlan(contractValue, vendor, targetTicket.executionProgress.paymentFlowParts);
    }

    const approvedValueBefore = getApprovedPaymentValue(existingPayments);
    const { nextPayments, newlyApproved, releasedPercent, normalizedProgress } = applyProgressToPayments(
      baselinePayments,
      progressPercent
    );
    const newlyReleasedPercent = newlyApproved.reduce(
      (total, payment) => total + Number(payment.releasedPercent || 0),
      0
    );
    const approvedValueAfter = getApprovedPaymentValue(nextPayments);
    const newlyReleasedValue = Math.max(0, approvedValueAfter - approvedValueBefore);

    const now = new Date();
    const measurement: MeasurementRecord = {
      id: `measurement-${Date.now()}`,
      label: draft.label.trim() || `Andamento atualizado para ${normalizedProgress}%`,
      progressPercent: normalizedProgress,
      releasePercent: newlyReleasedPercent,
      status: newlyApproved.length > 0 ? 'approved' : 'pending',
      notes: draft.notes.trim(),
      requestedAt: now,
      approvedAt: newlyApproved.length > 0 ? now : null,
    };
    const shouldMoveToValidation =
      normalizedProgress >= 100 &&
      targetTicket.status !== TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL &&
      targetTicket.status !== TICKET_STATUS.CLOSED &&
      targetTicket.status !== TICKET_STATUS.CANCELED;
    const nextStatus = shouldMoveToValidation ? TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL : targetTicket.status;
    const nextClosureChecklist =
      normalizedProgress >= 100 ? buildValidationClosureChecklist(targetTicket, now) : targetTicket.closureChecklist;

    setProcessingId(ticketId);
    try {
      const classification = buildProcurementClassification(targetTicket);
      if (createdPlan) {
        for (const payment of nextPayments) {
          await savePayment(ticketId, payment, classification);
        }
      } else {
        for (const payment of newlyApproved) {
          await savePayment(ticketId, payment, classification);
        }
      }
      await saveMeasurement(ticketId, measurement, classification);
      setMeasurementsByTicket(prev => ({
        ...prev,
        [ticketId]: [measurement, ...(prev[ticketId] || [])],
      }));
      setPaymentsByTicket(prev => ({
        ...prev,
        [ticketId]: nextPayments,
      }));
      updateTicket(ticketId, {
        status: nextStatus,
        closureChecklist: nextClosureChecklist,
        executionProgress: {
          paymentFlowParts: targetTicket.executionProgress.paymentFlowParts,
          currentPercent: normalizedProgress,
          releasedPercent,
          startedAt: targetTicket.executionProgress.startedAt || targetTicket.preliminaryActions?.actualStartAt || now,
          lastUpdatedAt: now,
        },
        history: [
          ...targetTicket.history,
          {
            id: crypto.randomUUID(),
            type: 'system',
            sender: actorLabel,
            time: now,
            text:
              shouldMoveToValidation
                ? `Andamento atualizado para ${measurement.progressPercent}%. Execução concluída e OS enviada para validação do solicitante.${newlyApproved.length > 0 ? ` ${newlyApproved.length} parcela(s) liberada(s), totalizando ${formatCurrency(newlyReleasedValue)}.` : ''}`
                : newlyApproved.length > 0
                  ? `Andamento atualizado para ${measurement.progressPercent}%. ${newlyApproved.length} parcela(s) liberada(s), totalizando ${formatCurrency(newlyReleasedValue)}.`
                  : `Andamento atualizado para ${measurement.progressPercent}%. Nenhuma nova parcela foi liberada neste marco.`,
          },
        ],
      });
      clearMeasurementDraft(ticketId);
      setMeasurementFormOpen(prev => ({ ...prev, [ticketId]: false }));
      setToast(
        shouldMoveToValidation
          ? 'Andamento salvo. Obra concluída e enviada para validação do solicitante.'
          : newlyApproved.length > 0
            ? `Andamento salvo. ${newlyApproved.length} parcela(s) liberada(s) para pagamento.`
            : 'Andamento salvo sem liberar novas parcelas.'
      );
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessingId(null);
    }
  };

  const handlePayInstallment = async (ticketId: string, payment: PaymentRecord) => {
    if (!canPay) return;
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!targetTicket) return;
    if (payment.status !== 'approved') {
      setToast('Erro: a parcela ainda não foi liberada pelo andamento da obra.');
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const existingPayments = paymentsByTicket[ticketId] || [];
    const pendingPayments = existingPayments.filter(item => item.status !== 'paid');
    const isFinalInstallment = pendingPayments.length === 1 && pendingPayments[0].id === payment.id;
    const closureDraft = getClosureDraft(ticketId, targetTicket.closureChecklist, targetTicket.guarantee);

    if (isFinalInstallment) {
      const guaranteeMonths = Number(closureDraft.guaranteeMonths || 0);
      if (
        !closureDraft.requesterApproved ||
        !closureDraft.infrastructureApprovalPrimary ||
        !closureDraft.infrastructureApprovalSecondary ||
        !closureDraft.serviceStartedAt ||
        !closureDraft.serviceCompletedAt ||
        !Number.isFinite(guaranteeMonths) ||
        guaranteeMonths <= 0
      ) {
        setToast('Erro: preencha o checklist de encerramento e a garantia antes de quitar a última parcela.');
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
              infrastructureApprovalPrimary: closureDraft.infrastructureApprovalPrimary,
              infrastructureApprovalSecondary: closureDraft.infrastructureApprovalSecondary,
              closureNotes: closureDraft.closureNotes.trim(),
              serviceStartedAt,
              serviceCompletedAt,
              closedAt,
              documents: targetTicket.closureChecklist?.documents || [],
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
                ? `${payment.label || 'Pagamento'} confirmado. Todas as parcelas foram quitadas, checklist concluído e garantia iniciada.`
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
    <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-8 relative">
      {toast && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-sm shadow-lg flex items-center gap-3 z-[100] animate-in slide-in-from-top-4 fade-in ${toast.includes('Erro') ? 'bg-red-800 text-white' : 'bg-green-800 text-white'}`}>
          <CheckCircle size={18} />
          <span className="font-medium text-sm">{toast}</span>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        <header className="mb-5 rounded-2xl border border-roman-border bg-roman-surface px-5 py-5 shadow-sm md:px-6">
          <h1 className="text-[2rem] font-serif font-medium text-roman-text-main mb-1.5">Painel Financeiro</h1>
          <p className="text-sm text-roman-text-sub font-serif italic">Medições, liberação de parcelas e confirmação de pagamentos das ordens de serviço validadas.</p>
        </header>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-roman-border bg-roman-surface p-4 shadow-sm">
            <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub">Status financeiro</div>
            <div className="mt-2 text-lg font-semibold text-roman-text-main">{financeSummary.tickets} OS em acompanhamento</div>
            <div className="mt-2 text-xs text-roman-text-sub">Pagas: {historicalFinanceTickets.length} • Em aberto: {openFinanceTickets.length}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
            <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-emerald-700">Pago até agora</div>
            <div className="mt-2 text-xl font-semibold text-emerald-900">{formatCurrency(financeSummary.paid)}</div>
            <div className="mt-2 text-xs text-emerald-800/80">Previsto total: {formatCurrency(financeSummary.planned)}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
            <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-amber-700">Saldo a liberar</div>
            <div className="mt-2 text-xl font-semibold text-amber-900">{formatCurrency(financeSummary.remaining)}</div>
            <div className="mt-2 text-xs text-amber-800/80">Próximo passo: liberar ou quitar parcelas pendentes</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-roman-border bg-roman-surface px-4 py-3 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFinanceSection('open')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${financeSection === 'open' ? 'bg-roman-sidebar text-white' : 'border border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary'}`}
              >
                Em aberto ({openFinanceTickets.length})
              </button>
              <button
                onClick={() => setFinanceSection('history')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${financeSection === 'history' ? 'bg-roman-sidebar text-white' : 'border border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary'}`}
              >
                Histórico ({historicalFinanceTickets.length})
              </button>
            </div>
            <div className="text-xs text-roman-text-sub">
              {financeSection === 'open'
                ? 'OS com parcelas pendentes, liberações em andamento ou checklist final aberto.'
                : 'OS quitadas para consulta histórica.'}
            </div>
          </div>

          {visibleFinanceTickets.map(({ ticket, payments, measurements, contract, totalValue, totalReleased, plannedValue, paidValue, remainingValue, pendingInstallments, nextPendingInstallment, nextMilestonePercent }) => {
            const ticketProcessing = processingId === ticket.id || processingId?.startsWith(`${ticket.id}:`);
            const vendor = contract?.vendor || payments[0]?.vendor || 'Fornecedor a confirmar';
            const contractValue = contract?.value || payments[0]?.value || 'Valor a confirmar';
            const measurementDraft = getMeasurementDraft(ticket.id);
            const closureDraft = getClosureDraft(ticket.id, ticket.closureChecklist, ticket.guarantee);
            const closureDocuments = ticket.closureChecklist?.documents || [];
            const progressPercent = Math.min(100, Math.max(0, Number(ticket.executionProgress?.currentPercent || 0)));
            const releasePreview = getMeasurementReleasePreview(ticket, measurementDraft.progressPercent);
            const isCollapsed = collapsedTickets[ticket.id] ?? financeSection === 'history';

            return (
              <div
                key={ticket.id}
                id={`finance-ticket-${ticket.id}`}
                className={`bg-roman-surface border rounded-2xl p-4 shadow-sm relative overflow-hidden ${
                  ticket.id === activeTicketId
                    ? 'border-roman-primary/60 ring-1 ring-roman-primary/20 bg-roman-primary/5'
                    : 'border-roman-border'
                }`}
              >
                {ticketProcessing && (
                  <div className="absolute inset-0 bg-roman-surface/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                    <Loader2 size={32} className="text-roman-primary animate-spin mb-4" />
                    <span className="font-serif text-roman-text-main font-medium">Atualizando fluxo financeiro...</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 border-b border-roman-border bg-roman-surface/80 px-4 py-3">
                  <div className="text-xs text-roman-text-sub">
                    {pendingInstallments.length > 0
                      ? `${pendingInstallments.length} parcela(s) pendente(s)`
                      : 'Fluxo quitado'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCollapsedTickets(prev => ({ ...prev, [ticket.id]: !isCollapsed }))}
                    className="inline-flex items-center gap-2 rounded-full border border-roman-border bg-roman-bg px-3 py-1.5 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                  >
                    <ChevronDown size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                    {isCollapsed ? 'Expandir' : 'Recolher'}
                  </button>
                </div>

                {!isCollapsed && (
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1 space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <span className="text-roman-primary font-serif italic text-sm">{ticket.id}</span>
                        <span className="text-xs text-roman-text-sub font-medium px-2 py-0.5 bg-roman-bg border border-roman-border rounded-sm">{ticket.status}</span>
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
                        Fornecedor: {vendor} | Contrato: {contractValue} | Validação: {formatDateTimeSafe(ticket.time)}
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
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Andamento / liberado</div>
                        <div className="text-lg font-serif text-roman-text-main">{progressPercent}% / {totalReleased}%</div>
                      </div>
                      <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                        <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Próximo marco</div>
                        <div className="text-lg font-serif text-roman-text-main">
                          {nextMilestonePercent != null ? `${nextMilestonePercent}%` : nextPendingInstallment?.label || 'Nenhum'}
                        </div>
                      </div>
                    </div>

                    <FinanceSection
                      title="Andamento da obra"
                      description="Execução acumulada e marcos liberados."
                      icon={<ClipboardList size={15} />}
                    >
                      <div className="mb-3 flex items-center justify-between text-xs text-roman-text-sub">
                        <span>Fluxo definido</span>
                        <strong className="text-roman-text-main">
                          {ticket.executionProgress?.paymentFlowParts ? `${ticket.executionProgress.paymentFlowParts}x` : 'Não definido'}
                        </strong>
                      </div>

                      <div className="rounded-xl border border-roman-border bg-roman-surface px-4 py-4">
                        <div className="flex items-center justify-between text-sm text-roman-text-main mb-2">
                          <span>Execução acumulada</span>
                          <span className="font-semibold">{progressPercent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-stone-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-roman-sidebar transition-all"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-roman-text-sub">
                          <span>Parcelas liberadas: {totalReleased}%</span>
                          <span>
                            Próximo marco: {nextMilestonePercent != null ? `${nextMilestonePercent}%` : 'Todos liberados'}
                          </span>
                          <span>
                            Última atualização: {formatDateTimeSafe(ticket.executionProgress?.lastUpdatedAt || ticket.time)}
                          </span>
                        </div>
                      </div>
                    </FinanceSection>

                    <FinanceSection
                      title="Previsto x pago"
                      description="Conciliação entre contrato, plano e pagamentos."
                      icon={<DollarSign size={15} />}
                    >
                      <div className={`mb-3 inline-flex text-xs font-medium px-2 py-1 rounded-sm border ${remainingValue > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                        {remainingValue > 0 ? 'Saldo pendente' : 'Quitado'}
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
                    </FinanceSection>

                    <FinanceSection
                      title="Atualizações de andamento"
                      description="Cada avanço recalcula as parcelas liberadas."
                      icon={<PlusCircle size={15} />}
                      defaultOpen={measurements.length === 0}
                    >
                      <div className="mb-3 flex items-center justify-end">
                        <button
                          onClick={() => setMeasurementFormOpen(prev => ({ ...prev, [ticket.id]: !prev[ticket.id] }))}
                          className="text-xs font-medium text-roman-primary hover:underline flex items-center gap-1"
                        >
                          <PlusCircle size={14} /> {measurementFormOpen[ticket.id] ? 'Fechar atualização' : 'Atualizar andamento'}
                        </button>
                      </div>

                      {measurementFormOpen[ticket.id] && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 border border-roman-border rounded-sm p-3 bg-roman-surface">
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Descrição da atualização</label>
                            <input
                              type="text"
                              value={measurementDraft.label}
                              onChange={e => setMeasurementDraft(ticket.id, { label: e.target.value })}
                              className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                              placeholder="Ex: cobertura finalizada e pintura iniciada"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Marco de andamento</label>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                              {getPaymentFlowMilestones(ticket.executionProgress?.paymentFlowParts || 1).map(milestone => {
                                const currentSaved = progressPercent;
                                const selectedMilestone = Number(measurementDraft.progressPercent || currentSaved);
                                const isCurrent = selectedMilestone === milestone;
                                const isCompleted = milestone <= currentSaved;
                                return (
                                  <button
                                    key={milestone}
                                    type="button"
                                    onClick={() => setMeasurementDraft(ticket.id, { progressPercent: String(milestone) })}
                                    className={[
                                      'rounded-sm border px-3 py-3 text-left transition-colors',
                                      isCurrent
                                        ? 'border-roman-primary bg-roman-primary/10 text-roman-primary'
                                        : isCompleted
                                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                          : 'border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary/40',
                                    ].join(' ')}
                                  >
                                    <div className="text-[10px] font-serif uppercase tracking-widest opacity-75">Marco</div>
                                    <div className="mt-1 text-base font-semibold">{milestone}%</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">% liberado nesta atualização</label>
                            <input
                              type="text"
                              value={`${releasePreview}%`}
                              disabled
                              className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Observações</label>
                            <textarea
                              value={measurementDraft.notes}
                              onChange={e => setMeasurementDraft(ticket.id, { notes: e.target.value })}
                              className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
                              placeholder="Ex: relatório com fotos enviado para liberação."
                            />
                          </div>
                          <div className="md:col-span-2 rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
                            <div className="font-medium text-roman-text-main mb-1">Leitura do fluxo</div>
                            <div>Fluxo: {ticket.executionProgress?.paymentFlowParts ? `${ticket.executionProgress.paymentFlowParts}x` : 'não definido'}</div>
                            <div>Andamento atual salvo: {progressPercent}%</div>
                            <div>Próximo marco: {nextMilestonePercent != null ? `${nextMilestonePercent}%` : 'todos os marcos liberados'}</div>
                          </div>
                          <div className="md:col-span-2 flex justify-end">
                            <button
                              onClick={() => handleAddMeasurement(ticket.id)}
                              className="px-4 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm"
                            >
                              Salvar andamento
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {measurements.length === 0 ? (
                          <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma medição registrada.</p>
                        ) : (
                          measurements.map(measurement => (
                            <div key={measurement.id} className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                <div>
                              <div className="text-sm font-medium text-roman-text-main">{measurement.label}</div>
                              <div className="text-xs text-roman-text-sub">
                                    {measurement.progressPercent}% acumulado | {measurement.releasePercent}% liberado | {normalizeStatusLabel(measurement.status)}
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
                    </FinanceSection>

                    {contract?.items && contract.items.length > 0 && (
                      <FinanceSection
                        title="Escopo contratado"
                        description="Itens aprovados na cotação vencedora."
                        icon={<FileText size={15} />}
                      >
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
                      </FinanceSection>
                    )}

                    <FinanceSection
                      title="Fluxo de pagamento"
                      description="Parcelas liberadas conforme os marcos de execução."
                      icon={<DollarSign size={15} />}
                      defaultOpen
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div />
                        {payments.length === 0 && !ticket.executionProgress?.paymentFlowParts && (
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(parts => (
                              <button
                                key={parts}
                                onClick={() => generatePaymentPlan(ticket.id, totalValue, vendor, parts)}
                                className="px-3 py-1.5 border border-roman-border rounded-sm text-xs font-medium text-roman-text-main hover:border-roman-primary"
                              >
                                {parts === 1 ? 'À vista' : `${parts}x`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {payments.length === 0 ? (
                        <div className="text-sm text-roman-text-sub font-serif italic">
                          {ticket.executionProgress?.paymentFlowParts
                            ? `Fluxo definido em ${ticket.executionProgress.paymentFlowParts}x. Registre o primeiro avanço para gerar e liberar as parcelas automaticamente.`
                            : 'Nenhum fluxo definido ainda. Configure a execução da obra para criar o plano automaticamente.'}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {payments.map(payment => (
                            (() => {
                              const pendingPaymentsForTicket = payments.filter(item => item.status !== 'paid');
                              const isFinalInstallment = pendingPaymentsForTicket.length === 1 && pendingPaymentsForTicket[0].id === payment.id;
                              const finalInstallmentBlockingReasons = isFinalInstallment ? getFinalInstallmentBlockingReasons(closureDraft) : [];
                              const canConfirmPayment =
                                canPay &&
                                payment.status === 'approved' &&
                                (!isFinalInstallment || finalInstallmentBlockingReasons.length === 0);

                              return (
                            <div key={payment.id} className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-roman-text-main">{payment.label || `Parcela ${payment.installmentNumber || 1}`}</div>
                                <div className="text-xs text-roman-text-sub">
                                  {payment.value} | {payment.releasedPercent || 0}% da obra | libera em {payment.milestonePercent || payment.releasedPercent || 0}% | vencimento {formatDateLabel(payment.dueAt)}
                                </div>
                                {payment.paidAt && <div className="text-xs text-green-700 mt-1">Pago em {formatDateLabel(payment.paidAt)}</div>}
                                {payment.status === 'approved' && isFinalInstallment && finalInstallmentBlockingReasons.length > 0 && (
                                  <div className="mt-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
                                    <div className="font-medium">Última parcela bloqueada até concluir o encerramento:</div>
                                    {finalInstallmentBlockingReasons.map(reason => (
                                      <div key={reason}>- {reason}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-medium px-2 py-1 rounded-sm border ${
                                  payment.status === 'paid'
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : payment.status === 'approved'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  {payment.status === 'paid' ? 'Pago' : payment.status === 'approved' ? 'Liberada' : 'Pendente'}
                                </span>
                                <button
                                  onClick={() => handlePayInstallment(ticket.id, payment)}
                                  disabled={!canConfirmPayment}
                                  className="px-4 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <DollarSign size={15} /> {payment.status !== 'approved' ? 'Aguardando avanço' : canConfirmPayment ? 'Confirmar' : 'Preencher checklist'}
                                </button>
                              </div>
                            </div>
                              );
                            })()
                          ))}
                        </div>
                      )}
                    </FinanceSection>

                    <FinanceSection
                      title="Encerramento e garantia"
                      description="Checklist final, laudos e período de garantia."
                      icon={<CheckCircle size={15} />}
                      defaultOpen={ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL || ticket.status === TICKET_STATUS.WAITING_PAYMENT}
                    >

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <label className={`flex items-center gap-3 p-3 border rounded-sm text-sm ${closureDraft.requesterApproved ? 'border-roman-primary bg-roman-primary/5 text-roman-primary' : 'border-roman-border text-roman-text-main'}`}>
                          <input
                            type="checkbox"
                            checked={closureDraft.requesterApproved}
                            onChange={e => setClosureDraft(ticket.id, { requesterApproved: e.target.checked })}
                          />
                          Solicitante confirmou a conclusão
                        </label>
                        <label className={`flex items-center gap-3 p-3 border rounded-sm text-sm ${closureDraft.infrastructureApprovalPrimary ? 'border-roman-primary bg-roman-primary/5 text-roman-primary' : 'border-roman-border text-roman-text-main'}`}>
                          <input
                            type="checkbox"
                            checked={closureDraft.infrastructureApprovalPrimary}
                            onChange={e => setClosureDraft(ticket.id, { infrastructureApprovalPrimary: e.target.checked })}
                          />
                          Aprovação de infraestrutura 1
                        </label>
                        <label className={`flex items-center gap-3 p-3 border rounded-sm text-sm ${closureDraft.infrastructureApprovalSecondary ? 'border-roman-primary bg-roman-primary/5 text-roman-primary' : 'border-roman-border text-roman-text-main'}`}>
                          <input
                            type="checkbox"
                            checked={closureDraft.infrastructureApprovalSecondary}
                            onChange={e => setClosureDraft(ticket.id, { infrastructureApprovalSecondary: e.target.checked })}
                          />
                          Aprovação de infraestrutura 2
                        </label>
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-3 py-3 text-xs text-roman-text-sub">
                          <div>Solicitante: {ticket.closureChecklist?.requesterApprovedBy || ticket.requester}</div>
                          <div>Aprovação registrada: {formatDateLabel(ticket.closureChecklist?.requesterApprovedAt)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                        <div>
                          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Início do serviço</label>
                          <input
                            type="date"
                            value={closureDraft.serviceStartedAt}
                            onChange={e => setClosureDraft(ticket.id, { serviceStartedAt: e.target.value })}
                            className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Término do serviço</label>
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
                        <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Observações de encerramento</label>
                        <textarea
                          value={closureDraft.closureNotes}
                          onChange={e => setClosureDraft(ticket.id, { closureNotes: e.target.value })}
                          className="w-full min-h-24 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary resize-y"
                          placeholder="Ex: laudo final anexado, direção comunicada, garantia de 12 meses para estrutura."
                        />
                      </div>

                      <div className="mt-4 border border-roman-border rounded-sm bg-roman-surface px-4 py-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-roman-text-main">Laudos e anexos de encerramento</div>
                            <div className="text-xs text-roman-text-sub mt-1">Envie PDF para laudos e imagens para evidências fotográficas.</div>
                          </div>
                          <label className="px-4 py-2 border border-roman-border rounded-sm text-sm font-medium text-roman-text-main hover:border-roman-primary cursor-pointer">
                            {uploadingTicketId === ticket.id ? 'Enviando...' : 'Anexar documento'}
                            <input
                              type="file"
                              accept=".pdf,image/*"
                              className="hidden"
                              disabled={uploadingTicketId === ticket.id}
                              onChange={event => {
                                const file = event.target.files?.[0] || null;
                                void handleClosureDocumentUpload(ticket.id, file);
                                event.currentTarget.value = '';
                              }}
                            />
                          </label>
                        </div>

                        {closureDocuments.length === 0 ? (
                          <div className="mt-3 text-sm text-roman-text-sub font-serif italic">Nenhum laudo ou anexo vinculado ao encerramento.</div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {closureDocuments.map(document => (
                              <div key={document.id} className="border border-roman-border rounded-sm bg-roman-bg px-3 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                <div>
                                  <div className="text-sm font-medium text-roman-text-main">{document.name}</div>
                                  <div className="text-xs text-roman-text-sub">
                                    {document.category === 'closure_report' ? 'Laudo / PDF' : 'Evidência'} | {document.size ? `${Math.round(document.size / 1024)} KB` : 'tamanho não informado'}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-roman-text-sub">{formatDateLabel(document.uploadedAt)}</span>
                                  <button
                                    type="button"
                                    onClick={() => window.open(document.url, '_blank', 'noopener,noreferrer')}
                                    className="text-sm font-medium text-roman-primary hover:underline"
                                  >
                                    Abrir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleClosureDocumentRemove(ticket.id, document.id)}
                                    disabled={uploadingTicketId === ticket.id}
                                    className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                                  >
                                    <Trash2 size={14} />
                                    Remover
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {ticket.guarantee && (
                        <div className="mt-4 border border-roman-border rounded-sm bg-roman-surface px-3 py-3 text-xs text-roman-text-sub">
                          <div className="font-medium text-roman-text-main mb-1">Garantia atual</div>
                          <div>Status: {ticket.guarantee.status === 'active' ? 'Ativa' : ticket.guarantee.status === 'expired' ? 'Expirada' : 'Pendente'}</div>
                          <div>Início: {formatDateLabel(ticket.guarantee.startAt)}</div>
                          <div>Fim: {formatDateLabel(ticket.guarantee.endAt)}</div>
                        </div>
                      )}
                    </FinanceSection>
                  </div>

                  <aside className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-roman-border pt-4 lg:pt-0 lg:pl-6">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openAttachment(`Nota Fiscal: ${vendor}`, 'pdf')} className="flex-1 min-w-[11rem] flex items-center justify-center gap-2 text-roman-primary border border-roman-border rounded-sm py-2 hover:border-roman-primary transition-colors text-sm font-medium">
                          <FileText size={16} /> Ver NF / Recibo
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportClosureHtml(ticket, contract, measurements, payments, plannedValue, paidValue)}
                          className="border border-roman-border rounded-sm px-3 py-2 text-xs font-medium text-roman-text-main hover:border-roman-primary transition-colors"
                        >
                          HTML
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintClosure(ticket, contract, measurements, payments, plannedValue, paidValue)}
                          className="border border-roman-border rounded-sm px-3 py-2 text-xs font-medium text-roman-text-main hover:border-roman-primary transition-colors"
                        >
                          PDF
                        </button>
                      </div>
                      <div className="rounded-xl border border-roman-border bg-roman-bg px-4 py-3">
                        <div className="font-medium text-roman-text-main mb-3">Resumo financeiro</div>
                        <div className="grid grid-cols-1 gap-2">
                          <div className="rounded-lg border border-roman-border bg-roman-surface px-3 py-2">
                            <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Contrato</div>
                            <div className="mt-1 text-sm font-semibold text-roman-text-main">{contractValue}</div>
                          </div>
                          <div className="rounded-lg border border-roman-border bg-roman-surface px-3 py-2">
                            <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Pago</div>
                            <div className="mt-1 text-sm font-semibold text-roman-text-main">{formatCurrency(paidValue)}</div>
                          </div>
                          <div className="rounded-lg border border-roman-border bg-roman-surface px-3 py-2">
                            <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Saldo pendente</div>
                            <div className="mt-1 text-sm font-semibold text-roman-text-main">{formatCurrency(remainingValue)}</div>
                          </div>
                        </div>
                        <details className="mt-3 rounded-lg border border-roman-border bg-roman-surface px-3 py-2">
                          <summary className="cursor-pointer text-xs font-medium text-roman-text-main">Ver mais detalhes</summary>
                          <div className="mt-3 space-y-1.5 text-xs text-roman-text-sub">
                            <div>Previsto no plano: {formatCurrency(plannedValue)}</div>
                            <div>Classificação: {ticket.serviceCatalogName || ticket.macroServiceName || 'Não definida'}</div>
                            <div>Laudos anexados: {closureDocuments.length}</div>
                            <div>Parcelas pendentes: {pendingInstallments.length}</div>
                            <div>Medições registradas: {measurements.length}</div>
                            <div>Última atualização: {formatDateTimeSafe(ticket.time)}</div>
                          </div>
                        </details>
                      </div>
                    </div>
                  </aside>
                </div>
                )}
              </div>
            );
          })}

          {visibleFinanceTickets.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-2xl bg-roman-surface/70">
              <CheckCircle size={32} className="mx-auto text-roman-border mb-4" />
              <p className="text-roman-text-sub font-serif italic">
                {financeSection === 'open' ? 'Nenhum fluxo financeiro pendente no momento.' : 'Nenhuma OS quitada no histórico financeiro.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



