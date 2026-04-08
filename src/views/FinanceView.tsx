import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ChevronDown, ClipboardList, DollarSign, FileText, Loader2, Mail, PlusCircle, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { FloatingToast } from '../components/ui/FloatingToast';
import { ModalShell } from '../components/ui/ModalShell';
import { useToast } from '../hooks/useToast';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import type { ClosureChecklist, ContractRecord, GuaranteeInfo, MeasurementRecord, PaymentRecord, Ticket } from '../types';
import { fetchProcurementData, saveMeasurement, savePayment } from '../services/procurementApi';
import { fetchSettings } from '../services/settingsApi';
import { deleteTicketAttachment, uploadClosureDocument, uploadPaymentAttachment } from '../services/ticketStorage';
import { notifyPaymentDispatch } from '../services/ticketEmail';
import { buildValidationClosureChecklist } from '../utils/closureChecklist';
import { getApprovedReleasePercent, getNextMilestonePercentByProgress, getPaymentFlowMilestones } from '../utils/executionFlow';
import { buildProcurementClassification } from '../utils/procurementClassification';
import { formatDateTimeSafe } from '../utils/date';
import { getTicketRegionLabel, getTicketSiteLabel } from '../utils/ticketTerritory';

interface MeasurementFormState {
  label: string;
  grossAmount: string;
  notes: string;
}

interface PaymentSettlementDraft {
  grossValue: string;
  taxValue: string;
}

interface ClosureFormState {
  infrastructureApprovalPrimary: boolean;
  infrastructureApprovalSecondary: boolean;
  serviceStartedAt: string;
  serviceCompletedAt: string;
  guaranteeMonths: string;
  closureNotes: string;
}

interface PaymentEmailModalState {
  ticketId: string;
  payment: PaymentRecord;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  recipients: string[];
  newRecipient: string;
  isSending: boolean;
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

function sanitizeCurrencyTypingInput(value: string) {
  return String(value || '').replace(/[^\d,.-]/g, '');
}

function normalizeCurrencyInput(value: string) {
  const parsed = parseCurrency(value);
  return parsed > 0 ? formatCurrency(parsed) : '';
}

function roundProgressPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function resolveExpectedBaselineValue(contract?: ContractRecord, payments: PaymentRecord[] = []) {
  const contractInitial = parseCurrency(contract?.initialPlannedValue || '');
  if (contractInitial > 0) return contractInitial;

  const paymentBaseline = parseCurrency(payments[0]?.expectedBaselineValue || '');
  if (paymentBaseline > 0) return paymentBaseline;

  const contractValue = parseCurrency(contract?.value || '');
  if (contractValue > 0) return contractValue;

  return parseCurrency(payments[0]?.value || '');
}

function calculateProgressPercentFromGross(grossAmount: number, baselineValue: number) {
  if (!Number.isFinite(grossAmount) || grossAmount < 0 || baselineValue <= 0) return 0;
  return roundProgressPercent((grossAmount / baselineValue) * 100);
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
    .reduce((total, payment) => total + parseCurrency(payment.grossValue || payment.value), 0);
}

function sumPlannedValue(payments: PaymentRecord[]) {
  return payments.reduce((total, payment) => total + parseCurrency(payment.value), 0);
}

function normalizeStatusLabel(status: string) {
  if (status === 'paid') return 'Pago';
  if (status === 'approved') return 'Liberada';
  return 'Pendente';
}

function isLegacyMilestonePlaceholder(payment: PaymentRecord) {
  const hasGross = parseCurrency(payment.grossValue || '') > 0;
  const hasValue = parseCurrency(payment.value || '') > 0;
  const hasTax = parseCurrency(payment.taxValue || '') > 0;
  const hasNet = parseCurrency(payment.netValue || '') > 0;
  const hasMeasurementLink = Boolean(payment.measurementId);
  const hasAttachments = Array.isArray(payment.attachments) && payment.attachments.length > 0;
  const hasReceipt = Boolean(payment.receiptFileName);
  const isUnpaidStatus = payment.status === 'pending' || payment.status === 'approved';

  return isUnpaidStatus && !hasGross && !hasValue && !hasTax && !hasNet && !hasMeasurementLink && !hasAttachments && !hasReceipt;
}

function sortPaymentsByInstallment(a: PaymentRecord, b: PaymentRecord) {
  const installmentA = Number(a.installmentNumber || Number.MAX_SAFE_INTEGER);
  const installmentB = Number(b.installmentNumber || Number.MAX_SAFE_INTEGER);
  if (installmentA !== installmentB) return installmentA - installmentB;
  const dueA = a.dueAt instanceof Date ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
  const dueB = b.dueAt instanceof Date ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
  if (dueA !== dueB) return dueA - dueB;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function buildDynamicPaymentsFromMeasurements(
  measurements: MeasurementRecord[],
  vendor: string,
  flowParts: number
) {
  const sortedMeasurements = [...measurements].sort((a, b) => {
    const timeA = (a.requestedAt || a.approvedAt || new Date(0)).getTime();
    const timeB = (b.requestedAt || b.approvedAt || new Date(0)).getTime();
    return timeA - timeB;
  });

  return sortedMeasurements
    .filter(measurement => parseCurrency(measurement.grossValue || '') > 0)
    .map((measurement, index) => {
      const installmentNumber = index + 1;
      const label = `Lançamento ${installmentNumber}`;
      const dueAt = measurement.requestedAt || measurement.approvedAt || new Date(Date.now() + index * 7 * 24 * 60 * 60 * 1000);
      return {
        id: `measurement-payment-${measurement.id}`,
        vendor,
        value: measurement.grossValue || '',
        grossValue: measurement.grossValue || '',
        taxValue: '',
        netValue: measurement.grossValue || '',
        progressPercent: measurement.progressPercent,
        expectedBaselineValue: null,
        status: measurement.status === 'paid' ? 'paid' : measurement.status === 'approved' ? 'approved' : 'pending',
        label,
        installmentNumber,
        totalInstallments: flowParts > 0 ? flowParts : null,
        dueAt,
        measurementId: measurement.id,
        releasedPercent: measurement.releasePercent,
        milestonePercent: measurement.progressPercent,
        attachments: [],
        receiptFileName: null,
      } as PaymentRecord;
    });
}

function getEffectiveDynamicPayments(
  rawPayments: PaymentRecord[],
  measurements: MeasurementRecord[],
  vendor: string,
  flowParts: number
) {
  const nonLegacyPayments = rawPayments.filter(payment => !isLegacyMilestonePlaceholder(payment));
  if (nonLegacyPayments.length > 0) {
    return [...nonLegacyPayments].sort(sortPaymentsByInstallment);
  }
  return buildDynamicPaymentsFromMeasurements(measurements, vendor, flowParts);
}

function upsertDynamicPayment(rawPayments: PaymentRecord[], nextPayment: PaymentRecord) {
  const nonLegacyPayments = rawPayments.filter(payment => !isLegacyMilestonePlaceholder(payment));
  const existingIndex = nonLegacyPayments.findIndex(payment => payment.id === nextPayment.id);
  if (existingIndex >= 0) {
    const updated = [...nonLegacyPayments];
    updated[existingIndex] = nextPayment;
    return updated.sort(sortPaymentsByInstallment);
  }
  return [...nonLegacyPayments, nextPayment].sort(sortPaymentsByInstallment);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getGuaranteeDaysRemaining(guarantee?: GuaranteeInfo | null) {
  if (!guarantee?.endAt || Number.isNaN(guarantee.endAt.getTime())) return null;
  const today = startOfToday();
  const end = startOfToday();
  end.setFullYear(guarantee.endAt.getFullYear(), guarantee.endAt.getMonth(), guarantee.endAt.getDate());
  const diffMs = end.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function isTicketInGuarantee(guarantee?: GuaranteeInfo | null) {
  const remainingDays = getGuaranteeDaysRemaining(guarantee);
  return remainingDays != null && remainingDays >= 0;
}

function getFinanceNextActionLabel(ticket: Ticket) {
  if (ticket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS) return 'Concluir ações preliminares e liberar o início da execução.';
  if (ticket.status === TICKET_STATUS.IN_PROGRESS) return 'Atualizar o andamento da obra e liberar os próximos marcos.';
  if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) return 'Aguardar validação do solicitante para seguir o fechamento financeiro.';
  if (ticket.status === TICKET_STATUS.WAITING_PAYMENT) return 'Concluir lançamentos pendentes e finalizar o encerramento.';
  if (ticket.status === TICKET_STATUS.CLOSED) return 'Fluxo financeiro concluído.';
  if (ticket.status === TICKET_STATUS.CANCELED) return 'OS cancelada; manter apenas consulta histórica.';
  return 'Acompanhar evolução da OS e próximos marcos financeiros.';
}

type FinanceTab = 'execution' | 'financial' | 'guarantee' | 'documents';

function FinanceSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-roman-border bg-roman-bg/60 p-4">
      <div className="mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-roman-text-main">
          {icon}
          <span>{title}</span>
        </div>
        {description ? <p className="mt-1 text-xs text-roman-text-sub">{description}</p> : null}
      </div>
      {children}
    </section>
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
    ? '<tr><td colspan="5">Nenhum lançamento registrado.</td></tr>'
    : payments
        .map(
          payment => `
            <tr>
              <td>${escapeHtml(payment.label || `Lançamento ${payment.installmentNumber || '-'}`)}</td>
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
              <td>${escapeHtml(item.costUnitPrice || item.unitPrice || '-')}</td>
              <td>${escapeHtml(item.totalPrice || '-')}</td>
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
        <div><strong>Aprovação técnica 1:</strong> ${ticket.closureChecklist?.infrastructureApprovalPrimary ? 'Sim' : 'Não'}</div>
        <div><strong>Aprovação técnica 2:</strong> ${ticket.closureChecklist?.infrastructureApprovalSecondary ? 'Sim' : 'Não'}</div>
        <div><strong>Garantia:</strong> ${escapeHtml(formatDateLabel(ticket.guarantee?.startAt))} até ${escapeHtml(formatDateLabel(ticket.guarantee?.endAt))}</div>
      </div>
      <div class="card"><strong>Observações finais</strong><br /><span class="muted">${escapeHtml(ticket.closureChecklist?.closureNotes || 'Sem observações registradas.')}</span></div>

      <h2>Escopo contratado</h2>
      <table>
        <thead>
          <tr><th>Item</th><th>Quantidade</th><th>Custo unitário</th><th>Valor total</th></tr>
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
          <tr><th>Lançamento</th><th>Valor</th><th>% liberado</th><th>Status</th><th>Data</th></tr>
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

  if (!closureDraft.infrastructureApprovalPrimary) reasons.push('Aprovação técnica 1 pendente');
  if (!closureDraft.infrastructureApprovalSecondary) reasons.push('Aprovação técnica 2 pendente');
  if (!closureDraft.serviceStartedAt) reasons.push('Início do serviço não informado');
  if (!closureDraft.serviceCompletedAt) reasons.push('Término do serviço não informado');
  if (!Number.isFinite(guaranteeMonths) || guaranteeMonths <= 0) reasons.push('Garantia inválida');

  return reasons;
}

function shouldEnforceClosingChecklist(ticket: Ticket) {
  return ticket.status === TICKET_STATUS.WAITING_PAYMENT || ticket.status === TICKET_STATUS.CLOSED;
}

export function FinanceView() {
  const { activeTicketId, currentView, openAttachment, updateTicket, tickets, currentUser, refreshTickets } = useApp();
  const canAccess = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const canPay = canAccess;
  const actorLabel = currentUser?.role ? `${currentUser.name} (${currentUser.role})` : currentUser?.name || 'Financeiro';
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { toast, showToast } = useToast();
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord[]>>({});
  const [measurementsByTicket, setMeasurementsByTicket] = useState<Record<string, MeasurementRecord[]>>({});
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [measurementDraftByTicket, setMeasurementDraftByTicket] = useState<Record<string, MeasurementFormState>>({});
  const [measurementFormOpen, setMeasurementFormOpen] = useState<Record<string, boolean>>({});
  const [paymentDraftByKey, setPaymentDraftByKey] = useState<Record<string, PaymentSettlementDraft>>({});
  const [closureDraftByTicket, setClosureDraftByTicket] = useState<Record<string, ClosureFormState>>({});
  const [uploadingTicketId, setUploadingTicketId] = useState<string | null>(null);
  const [uploadingPaymentKey, setUploadingPaymentKey] = useState<string | null>(null);
  const autoScrollKeyRef = useRef<string>('');
  const [financeSection, setFinanceSection] = useState<'open' | 'history'>('open');
  const [historyGuaranteeFilter, setHistoryGuaranteeFilter] = useState<'all' | 'in_guarantee' | 'expiring_30'>('all');
  const [collapsedTickets, setCollapsedTickets] = useState<Record<string, boolean>>({});
  const [financeTabs, setFinanceTabs] = useState<Record<string, FinanceTab>>({});
  const [paymentEmailModal, setPaymentEmailModal] = useState<PaymentEmailModalState | null>(null);

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
    if (currentView !== 'finance') return undefined;

    let cancelled = false;
    const runSilentRefresh = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      await refreshTickets({ silent: true });
      try {
        const data = await fetchProcurementData();
        if (!cancelled) {
          setPaymentsByTicket(data.paymentsByTicket);
          setMeasurementsByTicket(data.measurementsByTicket);
          setContractsByTicket(data.contractsByTicket);
        }
      } catch {
        // Mantém o estado atual quando a sincronização silenciosa falhar.
      }
    };

    void runSilentRefresh();

    const interval = window.setInterval(() => {
      void runSilentRefresh();
    }, 10_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runSilentRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentView, refreshTickets]);

  useEffect(() => {
    setClosureDraftByTicket(prev => {
      const next = { ...prev };
      for (const ticket of tickets) {
        const current = next[ticket.id];
        const seeded = createClosureFormState(ticket.closureChecklist, ticket.guarantee);
        next[ticket.id] = current
          ? {
              ...current,
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

          return hasFinancialContext && ([
            TICKET_STATUS.IN_PROGRESS,
            TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL,
            TICKET_STATUS.WAITING_PAYMENT,
            TICKET_STATUS.CLOSED,
            TICKET_STATUS.CANCELED,
          ] as Ticket['status'][]).includes(ticket.status);
        })
        .map(ticket => {
          const rawPayments = paymentsByTicket[ticket.id] || [];
          const measurements = measurementsByTicket[ticket.id] || [];
          const contract = contractsByTicket[ticket.id];
          const flowParts = Number(ticket.executionProgress?.paymentFlowParts || 0);
          const vendor = contract?.vendor || rawPayments[0]?.vendor || ticket.assignedTeam || 'Fornecedor não definido';
          const payments = getEffectiveDynamicPayments(rawPayments, measurements, vendor, flowParts);
          const expectedBaselineValue = resolveExpectedBaselineValue(contract, payments);
          const totalValue = parseCurrency(contract?.realizedValue || contract?.value || payments[0]?.value || '0');
          const totalReleased = sumReleasedPercent(payments);
          const plannedValue = totalValue > 0 ? totalValue : payments.length > 0 ? sumPlannedValue(payments) : 0;
          const paidValue = sumPaidValue(payments);
          const remainingValue = plannedValue - paidValue;
          const pendingInstallments = payments.filter(payment => payment.status !== 'paid');
          const nextPendingInstallment = pendingInstallments[0] || null;
          const nextMilestonePercent = ticket.executionProgress?.paymentFlowParts
            ? getNextMilestonePercentByProgress(
                ticket.executionProgress.paymentFlowParts,
                Number(ticket.executionProgress?.currentPercent || 0)
              )
            : null;

          return {
            ticket,
            payments,
            measurements,
            contract,
            expectedBaselineValue,
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

  const isFinanceEntryHistorical = useCallback((entry: (typeof financeTickets)[number]) => {
    if (entry.ticket.status === TICKET_STATUS.CLOSED || entry.ticket.status === TICKET_STATUS.CANCELED) {
      return true;
    }
    const fullyPaid = entry.payments.length > 0 && entry.payments.every(payment => payment.status === 'paid');
    return fullyPaid && entry.remainingValue <= 0;
  }, []);

  const openFinanceTickets = useMemo(
    () => financeTickets.filter(entry => !isFinanceEntryHistorical(entry)),
    [financeTickets, isFinanceEntryHistorical]
  );

  const historicalFinanceTickets = useMemo(
    () => financeTickets.filter(entry => isFinanceEntryHistorical(entry)),
    [financeTickets, isFinanceEntryHistorical]
  );

  const historicalGuaranteeCounts = useMemo(() => {
    const inGuarantee = historicalFinanceTickets.filter(entry => isTicketInGuarantee(entry.ticket.guarantee)).length;
    const expiring30 = historicalFinanceTickets.filter(entry => {
      const days = getGuaranteeDaysRemaining(entry.ticket.guarantee);
      return days != null && days >= 0 && days <= 30;
    }).length;
    return {
      all: historicalFinanceTickets.length,
      inGuarantee,
      expiring30,
    };
  }, [historicalFinanceTickets]);

  const visibleFinanceTickets = useMemo(() => {
    if (financeSection === 'open') return openFinanceTickets;
    if (historyGuaranteeFilter === 'in_guarantee') {
      return historicalFinanceTickets.filter(entry => isTicketInGuarantee(entry.ticket.guarantee));
    }
    if (historyGuaranteeFilter === 'expiring_30') {
      return historicalFinanceTickets.filter(entry => {
        const days = getGuaranteeDaysRemaining(entry.ticket.guarantee);
        return days != null && days >= 0 && days <= 30;
      });
    }
    return historicalFinanceTickets;
  }, [financeSection, historyGuaranteeFilter, historicalFinanceTickets, openFinanceTickets]);

  useEffect(() => {
    if (currentView !== 'finance' || !activeTicketId) return;

    const autoScrollKey = `${currentView}:${financeSection}:${activeTicketId}`;
    if (autoScrollKeyRef.current === autoScrollKey) return;
    autoScrollKeyRef.current = autoScrollKey;

    const timer = window.setTimeout(() => {
      document.getElementById(`finance-ticket-${activeTicketId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeTicketId, currentView, financeSection]);

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

  useEffect(() => {
    setFinanceTabs(prev => {
      const next = { ...prev };
      for (const entry of financeTickets) {
        if (!(entry.ticket.id in next)) {
          next[entry.ticket.id] = 'financial';
        }
      }
      return next;
    });
  }, [financeTickets]);

  const getMeasurementDraft = (ticketId: string): MeasurementFormState =>
    measurementDraftByTicket[ticketId] || {
      label: '',
      grossAmount: '',
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

  const getMeasurementReleasePreview = (ticket: Ticket, grossInput: string) => {
    if (!ticket.executionProgress?.paymentFlowParts) {
      return { progressPercent: 0, releasePercent: 0 };
    }

    const grossAmount = parseCurrency(grossInput);
    const existingPayments = paymentsByTicket[ticket.id] || [];
    const contract = contractsByTicket[ticket.id];
    const baselineValue = resolveExpectedBaselineValue(contract, existingPayments);
    const currentProgress = Math.max(0, Number(ticket.executionProgress?.currentPercent || 0));
    const currentAccumulatedGross = baselineValue > 0 ? (baselineValue * currentProgress) / 100 : 0;
    const progressPercent = calculateProgressPercentFromGross(currentAccumulatedGross + grossAmount, baselineValue);
    const releasePercent = Math.max(0, roundProgressPercent(progressPercent - currentProgress));
    return {
      progressPercent,
      releasePercent,
    };
  };

  const getPaymentDraftKey = (ticketId: string, paymentId: string) => `${ticketId}:${paymentId}`;

  const getPaymentDraft = (ticketId: string, payment: PaymentRecord): PaymentSettlementDraft => {
    const key = getPaymentDraftKey(ticketId, payment.id);
    const current = paymentDraftByKey[key];
    if (current) return current;

    return {
      grossValue: payment.grossValue || '',
      taxValue: payment.taxValue || '',
    };
  };

  const setPaymentDraft = (ticketId: string, payment: PaymentRecord, updates: Partial<PaymentSettlementDraft>) => {
    const key = getPaymentDraftKey(ticketId, payment.id);
    setPaymentDraftByKey(prev => {
      const base = prev[key] || {
        grossValue: payment.grossValue || '',
        taxValue: payment.taxValue || '',
      };
      return {
        ...prev,
        [key]: {
          ...base,
          ...updates,
        },
      };
    });
  };

  const clearPaymentDraft = (ticketId: string, paymentId: string) => {
    const key = getPaymentDraftKey(ticketId, paymentId);
    setPaymentDraftByKey(prev => {
      const next = { ...prev };
      delete next[key];
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
      showToast(`Documento ${uploaded.name} anexado com sucesso.`, 3000);
    } catch (error) {
      showToast(`Erro: ${error instanceof Error ? error.message : 'falha no upload do documento.'}`, 4000);
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
      showToast(`Documento ${targetDocument.name} removido com sucesso.`, 3000);
    } catch (error) {
      showToast(`Erro: ${error instanceof Error ? error.message : 'falha ao remover o documento.'}`, 4000);
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
      showToast('Erro: não foi possível abrir a janela de impressão.', 3000);
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  const handleAddMeasurement = async (ticketId: string) => {
    const draft = getMeasurementDraft(ticketId);
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);

    if (!targetTicket) return;

    const grossAmount = parseCurrency(draft.grossAmount || '');
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      showToast('Erro: informe o valor bruto do lançamento/etapa.', 3000);
      return;
    }

    const rawPayments = paymentsByTicket[ticketId] || [];
    const existingMeasurements = measurementsByTicket[ticketId] || [];
    const baselineValue = resolveExpectedBaselineValue(contractsByTicket[ticketId], rawPayments);
    if (baselineValue <= 0) {
      showToast('Erro: valor previsto da obra não encontrado para calcular o andamento.', 3000);
      return;
    }

    const currentProgress = Number(targetTicket.executionProgress?.currentPercent || 0);
    const currentAccumulatedGross = (baselineValue * currentProgress) / 100;
    const accumulatedGross = currentAccumulatedGross + grossAmount;
    const progressPercent = calculateProgressPercentFromGross(accumulatedGross, baselineValue);

    if (!targetTicket.executionProgress?.paymentFlowParts) {
      showToast('Erro: inicie a execução e defina o fluxo de pagamento antes de registrar o andamento.', 3000);
      return;
    }

    const vendor =
      contractsByTicket[ticketId]?.vendor ||
      rawPayments[0]?.vendor ||
      targetTicket.assignedTeam ||
      'Fornecedor não definido';
    const effectiveExistingPayments = getEffectiveDynamicPayments(
      rawPayments,
      existingMeasurements,
      vendor,
      Number(targetTicket.executionProgress?.paymentFlowParts || 0)
    );
    if (progressPercent < currentProgress) {
      showToast('Erro: o andamento informado é menor do que o percentual já registrado.', 3000);
      return;
    }

    const now = new Date();
    const classification = buildProcurementClassification(targetTicket);
    const expectedBaselineFormatted = formatCurrency(baselineValue);
    const normalizedProgress = progressPercent;
    const progressDelta = Math.max(0, roundProgressPercent(normalizedProgress - currentProgress));
    const nextInstallmentNumber = effectiveExistingPayments.length + 1;
    const configuredFlowParts = Number(targetTicket.executionProgress.paymentFlowParts || 0);
    const formattedGrossAmount = formatCurrency(grossAmount);
    const paymentLabel = `Lançamento ${nextInstallmentNumber}`;
    const measurementId = `measurement-${Date.now()}`;
    const dueAt = new Date(now.getTime() + Math.max(0, nextInstallmentNumber - 1) * 7 * 24 * 60 * 60 * 1000);
    const nextPayment: PaymentRecord = {
      id: `payment-${Date.now()}-${nextInstallmentNumber}`,
      vendor,
      value: formattedGrossAmount,
      grossValue: formattedGrossAmount,
      taxValue: '',
      netValue: formattedGrossAmount,
      progressPercent: normalizedProgress,
      expectedBaselineValue: expectedBaselineFormatted,
      status: 'approved',
      label: paymentLabel,
      installmentNumber: nextInstallmentNumber,
      totalInstallments: configuredFlowParts > 0 ? configuredFlowParts : null,
      dueAt,
      measurementId,
      releasedPercent: progressDelta,
      milestonePercent: normalizedProgress,
      attachments: [],
      receiptFileName: null,
    };
    const measurement: MeasurementRecord = {
      id: measurementId,
      label:
        draft.label.trim() ||
        `Andamento atualizado para ${normalizedProgress}% (bruto ${formattedGrossAmount} | acumulado ${formatCurrency(accumulatedGross)})`,
      progressPercent: normalizedProgress,
      releasePercent: progressDelta,
      status: 'approved',
      grossValue: formattedGrossAmount,
      notes: draft.notes.trim(),
      requestedAt: now,
      approvedAt: now,
    };
    const shouldMoveToValidation =
      normalizedProgress >= 100 &&
      targetTicket.status !== TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL &&
      targetTicket.status !== TICKET_STATUS.WAITING_PAYMENT &&
      targetTicket.status !== TICKET_STATUS.CLOSED &&
      targetTicket.status !== TICKET_STATUS.CANCELED;
    const nextStatus = shouldMoveToValidation ? TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL : targetTicket.status;
    const nextClosureChecklist =
      normalizedProgress >= 100 ? buildValidationClosureChecklist(targetTicket, now) : targetTicket.closureChecklist;
    const historyNotesSuffix = draft.notes.trim() ? ` ${draft.notes.trim()}` : '';

    setProcessingId(ticketId);
    try {
      await savePayment(ticketId, nextPayment, classification);
      await saveMeasurement(ticketId, measurement, classification);
      setMeasurementsByTicket(prev => ({
        ...prev,
        [ticketId]: [measurement, ...(prev[ticketId] || [])],
      }));
      setPaymentsByTicket(prev => ({
        ...prev,
        [ticketId]: upsertDynamicPayment(prev[ticketId] || [], {
          ...nextPayment,
          expectedBaselineValue: expectedBaselineFormatted,
        }),
      }));
      updateTicket(ticketId, {
        status: nextStatus,
        closureChecklist: nextClosureChecklist,
        executionProgress: {
          paymentFlowParts: targetTicket.executionProgress.paymentFlowParts,
          currentPercent: normalizedProgress,
          releasedPercent: roundProgressPercent(Math.max(Number(targetTicket.executionProgress?.releasedPercent || 0), normalizedProgress)),
          measurementSheetUrl: targetTicket.executionProgress.measurementSheetUrl || null,
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
                ? `Andamento atualizado para ${measurement.progressPercent}% com lançamento bruto de ${formattedGrossAmount} e acumulado de ${formatCurrency(accumulatedGross)}. Execução concluída e OS enviada para validação do solicitante. ${paymentLabel} liberado para o financeiro.${historyNotesSuffix}`
                : `Andamento atualizado para ${measurement.progressPercent}% com lançamento bruto de ${formattedGrossAmount} e acumulado de ${formatCurrency(accumulatedGross)}. ${paymentLabel} liberado para o financeiro.${historyNotesSuffix}`,
          },
        ],
      });
      clearMeasurementDraft(ticketId);
      setMeasurementFormOpen(prev => ({ ...prev, [ticketId]: false }));
      showToast(
        shouldMoveToValidation
          ? 'Andamento salvo. Obra concluída e enviada para validação do solicitante.'
          : `${paymentLabel} registrada e liberada para pagamento.`
      , 3000);
    } finally {
      setProcessingId(null);
    }
  };

  const handlePaymentAttachmentUpload = async (ticketId: string, payment: PaymentRecord, files: FileList | null) => {
    if (!canPay) return;
    if (!files || files.length === 0) return;
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!targetTicket) return;

    const paymentKey = getPaymentDraftKey(ticketId, payment.id);
    setUploadingPaymentKey(paymentKey);
    try {
      const uploadedItems = await Promise.all(
        Array.from(files).map(file => uploadPaymentAttachment(ticketId, payment.id, file))
      );
      const nextPayment: PaymentRecord = {
        ...payment,
        attachments: [...(payment.attachments || []), ...uploadedItems],
      };
      await savePayment(ticketId, nextPayment, buildProcurementClassification(targetTicket));
      setPaymentsByTicket(prev => ({
        ...prev,
        [ticketId]: upsertDynamicPayment(prev[ticketId] || [], nextPayment),
      }));
      showToast(`${uploadedItems.length} anexo(s) vinculados a ${payment.label || 'lançamento'}.`, 3000);
    } catch (error) {
      showToast(`Erro: ${error instanceof Error ? error.message : 'falha ao enviar anexos do lançamento.'}`, 4000);
    } finally {
      setUploadingPaymentKey(null);
    }
  };

  const handlePaymentAttachmentRemove = async (ticketId: string, payment: PaymentRecord, attachmentId: string) => {
    if (!canPay) return;
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!targetTicket) return;

    const attachment = (payment.attachments || []).find(item => item.id === attachmentId);
    if (!attachment) return;

    const paymentKey = getPaymentDraftKey(ticketId, payment.id);
    setUploadingPaymentKey(paymentKey);
    try {
      if (attachment.path) {
        await deleteTicketAttachment(attachment.path);
      }
      const nextPayment: PaymentRecord = {
        ...payment,
        attachments: (payment.attachments || []).filter(item => item.id !== attachmentId),
      };
      await savePayment(ticketId, nextPayment, buildProcurementClassification(targetTicket));
      setPaymentsByTicket(prev => ({
        ...prev,
        [ticketId]: upsertDynamicPayment(prev[ticketId] || [], nextPayment),
      }));
      showToast(`Anexo removido de ${payment.label || 'lançamento'}.`, 3000);
    } catch (error) {
      showToast(`Erro: ${error instanceof Error ? error.message : 'falha ao remover anexo do lançamento.'}`, 4000);
    } finally {
      setUploadingPaymentKey(null);
    }
  };

  const handlePayInstallment = async (ticketId: string, payment: PaymentRecord) => {
    if (!canPay) return;
    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!targetTicket) return;
    if (payment.status !== 'approved') {
      showToast('Erro: o lançamento ainda não foi liberado pelo andamento da obra.', 3000);
      return;
    }

    const settlementDraft = getPaymentDraft(ticketId, payment);
    const grossAmount = parseCurrency(settlementDraft.grossValue || payment.grossValue || '');
    const taxAmount = parseCurrency(settlementDraft.taxValue || payment.taxValue || '0');
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
      showToast('Erro: informe o valor bruto do lançamento antes de confirmar o pagamento.', 3000);
      return;
    }
    if (!Number.isFinite(taxAmount) || taxAmount < 0) {
      showToast('Erro: informe um valor de imposto válido.', 3000);
      return;
    }
    if (taxAmount > grossAmount) {
      showToast('Erro: o imposto não pode ser maior do que o valor bruto.', 3000);
      return;
    }
    const netAmount = Math.max(0, grossAmount - taxAmount);

    const rawPayments = paymentsByTicket[ticketId] || [];
    const existingMeasurements = measurementsByTicket[ticketId] || [];
    const vendorForFlow =
      contractsByTicket[ticketId]?.vendor ||
      payment.vendor ||
      targetTicket.assignedTeam ||
      'Fornecedor não definido';
    const existingPayments = getEffectiveDynamicPayments(
      rawPayments,
      existingMeasurements,
      vendorForFlow,
      Number(targetTicket.executionProgress?.paymentFlowParts || 0)
    );
    const pendingPayments = existingPayments.filter(item => item.status !== 'paid');
    const isFinalInstallment = pendingPayments.length === 1 && pendingPayments[0].id === payment.id;
    const mustValidateClosingChecklist = isFinalInstallment && shouldEnforceClosingChecklist(targetTicket);
    const closureDraft = getClosureDraft(ticketId, targetTicket.closureChecklist, targetTicket.guarantee);

    if (mustValidateClosingChecklist) {
      const guaranteeMonths = Number(closureDraft.guaranteeMonths || 0);
      if (
        !closureDraft.infrastructureApprovalPrimary ||
        !closureDraft.infrastructureApprovalSecondary ||
        !closureDraft.serviceStartedAt ||
        !closureDraft.serviceCompletedAt ||
        !Number.isFinite(guaranteeMonths) ||
        guaranteeMonths <= 0
      ) {
        showToast('Erro: preencha o checklist de encerramento e a garantia antes de quitar o último lançamento.', 3000);
        return;
      }
    }

    let defaultRecipients: string[] = [];
    try {
      const settings = await fetchSettings();
      const paymentTemplate = settings.emailTemplates.find(t => t.trigger === 'EMAIL-FINANCEIRO-PAGAMENTO');
      if (paymentTemplate?.recipients?.trim()) {
        defaultRecipients = paymentTemplate.recipients
          .split(/[,;\s]+/)
          .map(e => e.trim())
          .filter(e => e.includes('@'));
      }
    } catch {
      // Fallback to empty recipients list; user can add manually.
    }

    setPaymentEmailModal({
      ticketId,
      payment,
      grossAmount,
      taxAmount,
      netAmount,
      recipients: defaultRecipients,
      newRecipient: '',
      isSending: false,
    });
  };

  const handleConfirmPaymentEmail = async () => {
    if (!paymentEmailModal) return;
    const { ticketId, payment, grossAmount, taxAmount, netAmount, recipients } = paymentEmailModal;
    if (recipients.length === 0) {
      showToast('Erro: adicione pelo menos um destinatário antes de enviar.', 3000);
      return;
    }

    const targetTicket = tickets.find(ticket => ticket.id === ticketId);
    if (!targetTicket) return;

    const existingMeasurements = measurementsByTicket[ticketId] || [];
    const rawPayments = paymentsByTicket[ticketId] || [];
    const vendorForFlow =
      contractsByTicket[ticketId]?.vendor ||
      payment.vendor ||
      targetTicket.assignedTeam ||
      'Fornecedor não definido';
    const existingPayments = getEffectiveDynamicPayments(
      rawPayments,
      existingMeasurements,
      vendorForFlow,
      Number(targetTicket.executionProgress?.paymentFlowParts || 0)
    );
    const closureDraft = getClosureDraft(ticketId, targetTicket.closureChecklist, targetTicket.guarantee);

    setPaymentEmailModal(prev => prev ? { ...prev, isSending: true } : null);
    setProcessingId(`${ticketId}:${payment.id}`);
    try {
      await notifyPaymentDispatch(targetTicket, payment, grossAmount, taxAmount, netAmount, recipients);

      const nextPayment: PaymentRecord = {
        ...payment,
        status: 'paid',
        paidAt: new Date(),
        grossValue: formatCurrency(grossAmount),
        taxValue: formatCurrency(taxAmount),
        netValue: formatCurrency(netAmount),
        attachments: payment.attachments || [],
      };
      await savePayment(ticketId, nextPayment, buildProcurementClassification(targetTicket));
      const nextPayments = existingPayments.map(item => (item.id === payment.id ? nextPayment : item));
      setPaymentsByTicket(prev => ({ ...prev, [ticketId]: nextPayments }));
      clearPaymentDraft(ticketId, payment.id);

      const allPaid = nextPayments.every(item => item.status === 'paid');
      const remainingPendingPayments = nextPayments.filter(item => item.status !== 'paid').length;
      const inFinalFinancialStage = shouldEnforceClosingChecklist(targetTicket);
      const canCloseTicket = allPaid && inFinalFinancialStage;
      if (targetTicket) {
        const guaranteeMonths = Number(closureDraft.guaranteeMonths || 12);
        const serviceStartedAt = closureDraft.serviceStartedAt ? new Date(`${closureDraft.serviceStartedAt}T12:00:00`) : null;
        const serviceCompletedAt = closureDraft.serviceCompletedAt ? new Date(`${closureDraft.serviceCompletedAt}T12:00:00`) : null;
        const closedAt = canCloseTicket ? new Date() : targetTicket.closureChecklist?.closedAt || null;
        const closureChecklist: ClosureChecklist | undefined = canCloseTicket
          ? {
              requesterApproved: targetTicket.closureChecklist?.requesterApproved ?? false,
              requesterApprovedBy: targetTicket.closureChecklist?.requesterApprovedBy || null,
              requesterApprovedAt: targetTicket.closureChecklist?.requesterApprovedAt || null,
              infrastructureApprovalPrimary: closureDraft.infrastructureApprovalPrimary,
              infrastructureApprovalSecondary: closureDraft.infrastructureApprovalSecondary,
              closureNotes: closureDraft.closureNotes.trim(),
              serviceStartedAt,
              serviceCompletedAt,
              closedAt,
              documents: targetTicket.closureChecklist?.documents || [],
            }
          : targetTicket.closureChecklist;
        const guarantee: GuaranteeInfo | undefined = canCloseTicket && serviceCompletedAt
          ? {
              startAt: serviceCompletedAt,
              endAt: addMonths(serviceCompletedAt, guaranteeMonths),
              months: guaranteeMonths,
              status: addMonths(serviceCompletedAt, guaranteeMonths).getTime() < Date.now() ? 'expired' : 'active',
            }
          : targetTicket.guarantee;

        updateTicket(ticketId, {
          status: canCloseTicket
            ? TICKET_STATUS.CLOSED
            : inFinalFinancialStage
              ? TICKET_STATUS.WAITING_PAYMENT
              : targetTicket.status,
          closureChecklist,
          guarantee,
          history: [
            ...targetTicket.history,
            {
              id: crypto.randomUUID(),
              type: 'system',
              sender: actorLabel,
              time: new Date(),
              text: canCloseTicket
                ? `${payment.label || 'Pagamento'} confirmado com bruto ${formatCurrency(grossAmount)}, imposto ${formatCurrency(taxAmount)} e líquido ${formatCurrency(netAmount)}. Email de pagamento disparado para ${recipients.join(', ')}. Todos os lançamentos foram quitados, checklist concluído e garantia iniciada.`
                : remainingPendingPayments > 0
                  ? `${payment.label || 'Pagamento'} confirmado com líquido ${formatCurrency(netAmount)}. Email de pagamento disparado para ${recipients.join(', ')}. Restam ${remainingPendingPayments} lançamento(s) pendente(s).`
                  : `${payment.label || 'Pagamento'} confirmado com líquido ${formatCurrency(netAmount)}. Email de pagamento disparado para ${recipients.join(', ')}. Todos os lançamentos atuais foram quitados.`,
            },
          ],
        });
      }
      setPaymentEmailModal(null);
      showToast(
        canCloseTicket
          ? `Pagamento final confirmado. OS ${ticketId} encerrada com sucesso.`
          : `${payment.label || 'Lançamento'} confirmado e email disparado.`
      , 3000);
    } catch (error) {
      showToast(`Erro ao processar pagamento: ${error instanceof Error ? error.message : 'falha desconhecida.'}`, 4000);
      setPaymentEmailModal(prev => prev ? { ...prev, isSending: false } : null);
    } finally {
      setProcessingId(null);
    }
  };

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

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-8 relative">
      <FloatingToast message={toast} />
      <div className="max-w-6xl mx-auto">
        <header className="mb-5 rounded-2xl border border-roman-border bg-roman-surface px-5 py-5 shadow-sm md:px-6">
          <h1 className="text-[2rem] font-serif font-medium text-roman-text-main mb-1.5">Painel Financeiro</h1>
          <p className="text-sm text-roman-text-sub font-serif italic">Medições, liberação de lançamentos e confirmação de pagamentos das ordens de serviço em execução e fechamento.</p>
        </header>

        <div className="mb-5 grid gap-3 xl:grid-cols-2">
          <div className="rounded-2xl border border-roman-border bg-roman-surface p-4 shadow-sm">
            <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-roman-text-sub">Status financeiro</div>
            <div className="mt-2 text-lg font-semibold text-roman-text-main">{financeSummary.tickets} OS em acompanhamento</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs text-roman-text-sub">
              <div className="rounded-xl border border-roman-border bg-roman-bg px-3 py-2">Em aberto: {openFinanceTickets.length}</div>
              <div className="rounded-xl border border-roman-border bg-roman-bg px-3 py-2">Quitadas: {historicalFinanceTickets.length}</div>
              <div className="rounded-xl border border-roman-border bg-roman-bg px-3 py-2">Pendências: {financeSummary.remaining > 0 ? 'Sim' : 'Não'}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-roman-primary/35 bg-roman-primary/8 p-4 shadow-sm">
            <div className="text-[10px] font-serif uppercase tracking-[0.22em] text-roman-primary">Saldo a liberar</div>
            <div className="mt-2 text-lg font-semibold text-roman-text-main">{formatCurrency(financeSummary.remaining)}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs text-roman-text-sub">
              <div className="rounded-xl border border-roman-border bg-roman-surface/70 px-3 py-2">Previsto: {formatCurrency(financeSummary.planned)}</div>
              <div className="rounded-xl border border-roman-border bg-roman-surface/70 px-3 py-2">Pago: {formatCurrency(financeSummary.paid)}</div>
              <div className="rounded-xl border border-roman-border bg-roman-surface/70 px-3 py-2">Ação: liberar ou quitar lançamentos</div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-roman-border bg-roman-surface px-4 py-3 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setFinanceSection('open');
                  setHistoryGuaranteeFilter('all');
                }}
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
                ? 'OS com lançamentos pendentes, liberações em andamento ou checklist final aberto.'
                : 'OS quitadas para consulta histórica.'}
            </div>
            {financeSection === 'history' && (
              <div className="w-full flex flex-wrap gap-2 pt-2 border-t border-roman-border/60">
                <button
                  type="button"
                  onClick={() => setHistoryGuaranteeFilter('all')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    historyGuaranteeFilter === 'all'
                      ? 'bg-roman-sidebar text-white'
                      : 'border border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary'
                  }`}
                >
                  Todas ({historicalGuaranteeCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryGuaranteeFilter('in_guarantee')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    historyGuaranteeFilter === 'in_guarantee'
                      ? 'bg-roman-sidebar text-white'
                      : 'border border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary'
                  }`}
                >
                  Em garantia ({historicalGuaranteeCounts.inGuarantee})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryGuaranteeFilter('expiring_30')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    historyGuaranteeFilter === 'expiring_30'
                      ? 'bg-roman-sidebar text-white'
                      : 'border border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary'
                  }`}
                >
                  Vencendo em 30 dias ({historicalGuaranteeCounts.expiring30})
                </button>
              </div>
            )}
          </div>

          {visibleFinanceTickets.map(({ ticket, payments, measurements, contract, expectedBaselineValue, totalValue, totalReleased, plannedValue, paidValue, remainingValue, pendingInstallments, nextPendingInstallment, nextMilestonePercent }) => {
            const ticketProcessing = processingId === ticket.id || processingId?.startsWith(`${ticket.id}:`);
            const vendor = contract?.vendor || payments[0]?.vendor || 'Fornecedor a confirmar';
            const contractValue = contract?.value || payments[0]?.value || 'Valor a confirmar';
            const measurementDraft = getMeasurementDraft(ticket.id);
            const closureDraft = getClosureDraft(ticket.id, ticket.closureChecklist, ticket.guarantee);
            const closureDocuments = ticket.closureChecklist?.documents || [];
            const progressPercent = Math.max(0, Number(ticket.executionProgress?.currentPercent || 0));
            const progressBarPercent = Math.min(100, progressPercent);
            const releasePreview = getMeasurementReleasePreview(ticket, measurementDraft.grossAmount);
            const currentAccumulatedGross = expectedBaselineValue > 0 ? (expectedBaselineValue * progressPercent) / 100 : 0;
            const projectedAccumulatedGross = currentAccumulatedGross + parseCurrency(measurementDraft.grossAmount || '');
            const isCollapsed = collapsedTickets[ticket.id] ?? financeSection === 'history';
            const activeTab = financeTabs[ticket.id] || 'financial';
            const guaranteeDaysRemaining = getGuaranteeDaysRemaining(ticket.guarantee);
            const guaranteeBadgeLabel =
              guaranteeDaysRemaining == null
                ? 'Garantia não informada'
                : guaranteeDaysRemaining < 0
                  ? `Garantia expirada há ${Math.abs(guaranteeDaysRemaining)} dia(s)`
                  : `Garantia: ${guaranteeDaysRemaining} dia(s) restantes`;
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

                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-roman-border bg-roman-surface/80 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-roman-text-sub">OS em acompanhamento</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-roman-text-main">{ticket.id}</span>
                      <span className="rounded-full border border-roman-border bg-roman-bg px-2 py-0.5 text-xs text-roman-text-sub">
                        {ticket.status}
                      </span>
                      {financeSection === 'history' && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${
                          guaranteeDaysRemaining == null
                            ? 'border-roman-border bg-roman-bg text-roman-text-sub'
                            : guaranteeDaysRemaining < 0
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : guaranteeDaysRemaining <= 30
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}>
                          {guaranteeBadgeLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-medium text-roman-text-main">{ticket.subject}</div>
                    <p className="mt-1 text-xs text-roman-text-sub">
                      Fornecedor: {vendor} | Próxima ação: {getFinanceNextActionLabel(ticket)}
                    </p>
                    {ticket.executionProgress?.measurementSheetUrl && (
                      <a
                        href={ticket.executionProgress.measurementSheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-xs text-roman-primary hover:underline"
                      >
                        Planilha de medição
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCollapsedTickets(prev => ({ ...prev, [ticket.id]: !isCollapsed }))}
                      className="inline-flex items-center gap-2 rounded-full border border-roman-border bg-roman-bg px-3 py-1.5 text-xs font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                    >
                      <ChevronDown size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                      {isCollapsed ? 'Expandir' : 'Recolher'}
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-roman-border bg-roman-bg/60 p-3">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 text-xs text-roman-text-sub">
                      <div className="rounded-xl border border-roman-border bg-roman-surface px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-roman-text-sub">Classificação</div>
                        <div className="mt-1 font-medium text-roman-text-main">{ticket.serviceCatalogName || ticket.macroServiceName || 'Não definida'}</div>
                      </div>
                      <div className="rounded-xl border border-roman-border bg-roman-surface px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-roman-text-sub">Fluxo</div>
                        <div className="mt-1 font-medium text-roman-text-main">
                          {ticket.executionProgress?.paymentFlowParts ? `${ticket.executionProgress.paymentFlowParts}x` : 'Não definido'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-roman-border bg-roman-surface px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-roman-text-sub">Andamento</div>
                        <div className="mt-1 font-medium text-roman-text-main">{progressPercent}%</div>
                      </div>
                      <div className="rounded-xl border border-roman-border bg-roman-surface px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-roman-text-sub">Contrato</div>
                        <div className="mt-1 font-medium text-roman-text-main">{contractValue}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-roman-border bg-roman-bg/60 p-3">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['execution', 'Execução'],
                            ['financial', 'Financeiro'],
                            ['guarantee', 'Garantia'],
                            ['documents', 'Documentos'],
                          ] as [FinanceTab, string][]).map(([tab, label]) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() => setFinanceTabs(prev => ({ ...prev, [ticket.id]: tab }))}
                              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                                activeTab === tab
                                  ? 'bg-roman-sidebar text-white'
                                  : 'border border-roman-border bg-roman-surface text-roman-text-main hover:border-roman-primary'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openAttachment(`Nota Fiscal: ${vendor}`, 'pdf')}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-roman-border bg-roman-surface px-3 py-2 text-sm font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                          >
                            <FileText size={15} /> Ver NF / Recibo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportClosureHtml(ticket, contract, measurements, payments, plannedValue, paidValue)}
                            className="rounded-full border border-roman-border bg-roman-surface px-3 py-2 text-sm font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                          >
                            HTML
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintClosure(ticket, contract, measurements, payments, plannedValue, paidValue)}
                            className="rounded-full border border-roman-border bg-roman-surface px-3 py-2 text-sm font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFinanceTabs(prev => ({ ...prev, [ticket.id]: 'execution' }));
                              setMeasurementFormOpen(prev => ({ ...prev, [ticket.id]: !prev[ticket.id] }));
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-roman-primary/30 bg-roman-primary/5 px-3 py-2 text-sm font-medium text-roman-primary transition-colors hover:bg-roman-primary/10"
                          >
                            <PlusCircle size={15} /> Atualizar andamento
                          </button>
                        </div>
                      </div>
                    </div>

                    {activeTab === 'execution' && (
                      <>
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
                        <div className="h-2 rounded-full bg-roman-border-light overflow-hidden">
                          <div
                            className="h-full rounded-full bg-roman-sidebar transition-all"
                            style={{ width: `${progressBarPercent}%` }}
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-roman-text-sub">
                          <span>Marcos liberados: {totalReleased}%</span>
                          <span>
                            Próximo marco: {nextMilestonePercent != null ? `${nextMilestonePercent}%` : 'Todos liberados'}
                          </span>
                          {ticket.executionProgress?.measurementSheetUrl && (
                            <span>
                              Planilha:{' '}
                              <a
                                href={ticket.executionProgress.measurementSheetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-roman-primary hover:underline"
                              >
                                abrir link
                              </a>
                            </span>
                          )}
                          <span>
                            Última atualização: {formatDateTimeSafe(ticket.executionProgress?.lastUpdatedAt || ticket.time)}
                          </span>
                        </div>
                      </div>
                    </FinanceSection>

                    <FinanceSection
                      title="Atualizações de andamento"
                      description="Cada avanço registra um novo lançamento para o financeiro."
                      icon={<PlusCircle size={15} />}
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
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Valor bruto deste lançamento/etapa</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={measurementDraft.grossAmount}
                              onChange={event => setMeasurementDraft(ticket.id, { grossAmount: sanitizeCurrencyTypingInput(event.target.value) })}
                              onBlur={() => setMeasurementDraft(ticket.id, { grossAmount: normalizeCurrencyInput(measurementDraft.grossAmount) })}
                              placeholder="Ex: 12500,00"
                              className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                            />
                          </div>
                          <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3 text-xs text-roman-text-sub">
                            <div className="font-medium text-roman-text-main mb-1">Percentual calculado</div>
                            <div>{releasePreview.progressPercent}%</div>
                            <div className="mt-1">Andamento atual salvo: {progressPercent}%</div>
                            <div className="mt-1">Bruto acumulado projetado: {formatCurrency(projectedAccumulatedGross)}</div>
                          </div>
                          {expectedBaselineValue > 0 && (
                            <div className="md:col-span-2">
                              <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Atalhos por marco</label>
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                              {getPaymentFlowMilestones(ticket.executionProgress?.paymentFlowParts || 1).map(milestone => {
                                const milestoneGross = (expectedBaselineValue * milestone) / 100;
                                const projectedGross = Math.max(0, milestoneGross - currentAccumulatedGross);
                                const isCompleted = milestone <= progressPercent;
                                return (
                                  <button
                                    key={milestone}
                                    type="button"
                                    onClick={() => setMeasurementDraft(ticket.id, { grossAmount: formatCurrency(projectedGross) })}
                                    className={[
                                      'rounded-sm border px-3 py-3 text-left transition-colors',
                                      isCompleted
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                        : 'border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary/40',
                                    ].join(' ')}
                                  >
                                    <div className="text-[10px] font-serif uppercase tracking-widest opacity-75">Marco</div>
                                    <div className="mt-1 text-base font-semibold">{milestone}%</div>
                                    <div className="mt-1 text-[10px]">{formatCurrency(projectedGross)}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          )}
                          <div>
                            <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">% liberado nesta atualização</label>
                            <input
                              type="text"
                              value={`${releasePreview.releasePercent}%`}
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
                            <div>Previsto inicial: {expectedBaselineValue > 0 ? formatCurrency(expectedBaselineValue) : 'não definido'}</div>
                            <div>Bruto acumulado atual: {formatCurrency(currentAccumulatedGross)}</div>
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
                                  {(item.quantity ?? '-')}{item.unit ? ` ${item.unit}` : ''} | custo unitário {item.costUnitPrice || item.unitPrice || '-'}
                                </div>
                              </div>
                              <div className="text-sm font-serif text-roman-text-main">{item.totalPrice || '-'}</div>
                            </div>
                          ))}
                        </div>
                      </FinanceSection>
                    )}
                      </>
                    )}

                    {activeTab === 'financial' && (
                      <>
                    <FinanceSection
                      title="Previsto x pago"
                      description="Conciliação entre contrato, plano e pagamentos."
                      icon={<DollarSign size={15} />}
                    >
                      <div className={`mb-3 inline-flex text-xs font-medium px-2 py-1 rounded-sm border ${
                        remainingValue > 0
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : remainingValue < 0
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-green-50 text-green-700 border-green-200'
                      }`}>
                        {remainingValue > 0 ? 'Saldo pendente' : remainingValue < 0 ? 'Pagamento acima do previsto' : 'Quitado'}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Previsto inicial</div>
                          <div className="text-lg font-serif text-roman-text-main">{expectedBaselineValue > 0 ? formatCurrency(expectedBaselineValue) : 'Não informado'}</div>
                        </div>
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Realizado (previsto + aditivos)</div>
                          <div className="text-lg font-serif text-roman-text-main">{formatCurrency(totalValue)}</div>
                        </div>
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Valor pago</div>
                          <div className="text-lg font-serif text-roman-text-main">{formatCurrency(paidValue)}</div>
                        </div>
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3">
                          <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Aderência ao contrato</div>
                          <div className="text-lg font-serif text-roman-text-main">
                            {totalValue > 0 ? `${roundProgressPercent((paidValue / totalValue) * 100)}%` : '0%'}
                          </div>
                          <div className="mt-1 text-xs text-roman-text-sub">
                            {remainingValue >= 0
                              ? `Saldo: ${formatCurrency(remainingValue)}`
                              : `Excedente: ${formatCurrency(Math.abs(remainingValue))}`}
                          </div>
                        </div>
                      </div>
                    </FinanceSection>
                    <FinanceSection
                      title="Fluxo de pagamento"
                      description="Os lançamentos surgem conforme os registros de valor bruto no andamento."
                      icon={<DollarSign size={15} />}
                    >
                      <div className="mb-3 text-xs text-roman-text-sub">
                        O financeiro recebe um novo lançamento toda vez que o gestor registra valor bruto no andamento da obra.
                      </div>

                      {payments.length === 0 ? (
                        <div className="text-sm text-roman-text-sub font-serif italic">
                          {ticket.executionProgress?.paymentFlowParts
                            ? `Fluxo definido em ${ticket.executionProgress.paymentFlowParts}x. Registre andamento para criar os lançamentos dinamicamente.`
                            : 'Nenhum lançamento registrado ainda. Atualize o andamento para criar o primeiro lançamento.'}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {payments.map(payment => (
                            (() => {
                              const pendingPaymentsForTicket = payments.filter(item => item.status !== 'paid');
                              const isFinalInstallment = pendingPaymentsForTicket.length === 1 && pendingPaymentsForTicket[0].id === payment.id;
                              const mustValidateClosingChecklist = isFinalInstallment && shouldEnforceClosingChecklist(ticket);
                              const finalInstallmentBlockingReasons = mustValidateClosingChecklist ? getFinalInstallmentBlockingReasons(closureDraft) : [];
                              const canConfirmPayment =
                                canPay &&
                                payment.status === 'approved' &&
                                (!mustValidateClosingChecklist || finalInstallmentBlockingReasons.length === 0);
                              const paymentDraft = getPaymentDraft(ticket.id, payment);
                              const grossPreview = parseCurrency(paymentDraft.grossValue || payment.grossValue || '0');
                              const taxPreview = parseCurrency(paymentDraft.taxValue || payment.taxValue || '0');
                              const netPreview = Math.max(0, grossPreview - taxPreview);
                              const paymentKey = getPaymentDraftKey(ticket.id, payment.id);
                              const isUploadingPaymentAttachment = uploadingPaymentKey === paymentKey;

                              return (
                            <div key={payment.id} className="border border-roman-border rounded-sm bg-roman-surface px-4 py-3 space-y-3">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-roman-text-main">{payment.label || `Lançamento ${payment.installmentNumber || 1}`}</div>
                                <div className="text-xs text-roman-text-sub">
                                  Marco registrado: {payment.milestonePercent || payment.releasedPercent || 0}% | Bruto: {payment.grossValue || '-'} | Impostos: {payment.taxValue || '-'} | Líquido: {payment.netValue || '-'} | vencimento {formatDateLabel(payment.dueAt)}
                                </div>
                                {payment.paidAt && <div className="text-xs text-green-700 mt-1">Pago em {formatDateLabel(payment.paidAt)}</div>}
                                {payment.status === 'approved' && mustValidateClosingChecklist && finalInstallmentBlockingReasons.length > 0 && (
                                  <div className="mt-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
                                    <div className="font-medium">Último lançamento bloqueado até concluir o encerramento:</div>
                                    {finalInstallmentBlockingReasons.map(reason => (
                                      <div key={reason}>- {reason}</div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-roman-text-sub">
                                <div>
                                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Valor bruto</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={paymentDraft.grossValue}
                                    onChange={event => setPaymentDraft(ticket.id, payment, { grossValue: sanitizeCurrencyTypingInput(event.target.value) })}
                                    onBlur={() => setPaymentDraft(ticket.id, payment, { grossValue: normalizeCurrencyInput(paymentDraft.grossValue) })}
                                    disabled={payment.status === 'paid'}
                                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                                    placeholder="Ex: 1000,00"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1.5">Impostos</label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={paymentDraft.taxValue}
                                    onChange={event => setPaymentDraft(ticket.id, payment, { taxValue: sanitizeCurrencyTypingInput(event.target.value) })}
                                    onBlur={() => setPaymentDraft(ticket.id, payment, { taxValue: normalizeCurrencyInput(paymentDraft.taxValue) })}
                                    disabled={payment.status === 'paid'}
                                    className="w-full border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
                                    placeholder="Ex: 150,00"
                                  />
                                </div>
                                <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
                                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Líquido calculado</div>
                                  <div className="mt-1 text-sm font-semibold text-roman-text-main">{formatCurrency(netPreview)}</div>
                                </div>
                              </div>

                              <div className="rounded-sm border border-roman-border bg-roman-bg px-3 py-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <div className="text-xs text-roman-text-sub">Anexos do lançamento (PDF, PNG, JPG e similares).</div>
                                  <label className="inline-flex items-center gap-2 rounded-sm border border-roman-border bg-white px-3 py-1.5 text-xs font-medium text-roman-text-main hover:border-roman-primary cursor-pointer">
                                    {isUploadingPaymentAttachment ? 'Enviando...' : 'Anexar arquivos'}
                                    <input
                                      type="file"
                                      multiple
                                      accept=".pdf,image/*"
                                      className="hidden"
                                      disabled={isUploadingPaymentAttachment || payment.status === 'paid'}
                                      onChange={event => {
                                        void handlePaymentAttachmentUpload(ticket.id, payment, event.target.files);
                                        event.currentTarget.value = '';
                                      }}
                                    />
                                  </label>
                                </div>
                                {(payment.attachments || []).length > 0 && (
                                  <div className="mt-2 space-y-2">
                                    {(payment.attachments || []).map(attachment => (
                                      <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-roman-border bg-white px-3 py-2 text-xs">
                                        <div className="min-w-0">
                                          <div className="truncate font-medium text-roman-text-main">{attachment.name}</div>
                                          <div className="text-roman-text-sub">{attachment.uploadedAt ? formatDateLabel(attachment.uploadedAt) : 'Sem data'}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <button
                                            type="button"
                                            onClick={() => window.open(attachment.url, '_blank', 'noopener,noreferrer')}
                                            className="text-roman-primary hover:underline"
                                          >
                                            Abrir
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handlePaymentAttachmentRemove(ticket.id, payment, attachment.id)}
                                            disabled={isUploadingPaymentAttachment}
                                            className="text-red-700 hover:underline disabled:opacity-50"
                                          >
                                            Remover
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-3">
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
                                  onClick={() => void handlePayInstallment(ticket.id, payment)}
                                  disabled={!canConfirmPayment || processingId === `${ticket.id}:${payment.id}`}
                                  className="px-4 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {processingId === `${ticket.id}:${payment.id}` ? (
                                    <><Loader2 size={15} className="animate-spin" /> Processando...</>
                                  ) : payment.status !== 'approved' ? (
                                    <><DollarSign size={15} /> Aguardando avanço</>
                                  ) : canConfirmPayment ? (
                                    <><Mail size={15} /> Disparar Email</>
                                  ) : (
                                    <><DollarSign size={15} /> Preencher checklist</>
                                  )}
                                </button>
                              </div>
                            </div>
                              );
                            })()
                          ))}
                        </div>
                      )}
                    </FinanceSection>
                      </>
                    )}

                    {activeTab === 'guarantee' && (
                    <FinanceSection
                      title="Encerramento e garantia"
                      description="Checklist final, laudos e período de garantia."
                      icon={<CheckCircle size={15} />}
                    >

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
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

                      {ticket.guarantee && (
                        <div className="mt-4 border border-roman-border rounded-sm bg-roman-surface px-3 py-3 text-xs text-roman-text-sub">
                          <div className="font-medium text-roman-text-main mb-1">Garantia atual</div>
                          <div>Status: {ticket.guarantee.status === 'active' ? 'Ativa' : ticket.guarantee.status === 'expired' ? 'Expirada' : 'Pendente'}</div>
                          <div>Início: {formatDateLabel(ticket.guarantee.startAt)}</div>
                          <div>Fim: {formatDateLabel(ticket.guarantee.endAt)}</div>
                        </div>
                      )}
                    </FinanceSection>
                    )}

                    {activeTab === 'documents' && (
                      <FinanceSection
                        title="Documentos do encerramento"
                        description="Laudos, evidências e anexos da OS."
                        icon={<FileText size={15} />}
                      >
                        <div className="border border-roman-border rounded-sm bg-roman-surface px-4 py-4">
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
                      </FinanceSection>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {visibleFinanceTickets.length === 0 && (
            <div className="text-center py-12 border border-dashed border-roman-border rounded-2xl bg-roman-surface/70">
              <CheckCircle size={32} className="mx-auto text-roman-border mb-4" />
              <p className="text-roman-text-sub font-serif italic">
                {financeSection === 'open'
                  ? 'Nenhum fluxo financeiro pendente no momento.'
                  : historyGuaranteeFilter === 'all'
                    ? 'Nenhuma OS quitada no histórico financeiro.'
                    : historyGuaranteeFilter === 'in_guarantee'
                      ? 'Nenhuma OS quitada com garantia ativa no momento.'
                      : 'Nenhuma OS quitada com garantia vencendo em 30 dias.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <ModalShell
        isOpen={paymentEmailModal !== null}
        onClose={() => { if (!paymentEmailModal?.isSending) setPaymentEmailModal(null); }}
        title="Disparar Email de Pagamento"
        description={paymentEmailModal ? `OS-${paymentEmailModal.ticketId} - Pagamento - ${paymentEmailModal.payment.label || `Lançamento ${paymentEmailModal.payment.installmentNumber || 1}`}` : ''}
        maxWidthClass="max-w-lg"
        footer={
          paymentEmailModal && (
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentEmailModal(null)}
                disabled={paymentEmailModal.isSending}
                className="w-full sm:w-auto px-4 py-2 border border-roman-border rounded-sm text-sm text-roman-text-main hover:bg-roman-bg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPaymentEmail()}
                disabled={paymentEmailModal.isSending || paymentEmailModal.recipients.length === 0}
                className="w-full sm:w-auto px-4 py-2 bg-roman-sidebar hover:bg-stone-900 text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {paymentEmailModal.isSending ? (
                  <><Loader2 size={15} className="animate-spin" /> Enviando...</>
                ) : (
                  <><Mail size={15} /> Enviar Email e Confirmar</>
                )}
              </button>
            </div>
          )
        }
      >
        {paymentEmailModal && (
          <div className="space-y-4">
            <div className="rounded-sm border border-roman-border bg-roman-bg px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-roman-text-sub">Valor bruto</span>
                <span className="font-medium text-roman-text-main">{formatCurrency(paymentEmailModal.grossAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-roman-text-sub">Imposto</span>
                <span className="font-medium text-roman-text-main">{formatCurrency(paymentEmailModal.taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-roman-border pt-1 mt-1">
                <span className="text-roman-text-sub font-medium">Valor a pagar (líquido)</span>
                <span className="font-semibold text-roman-text-main">{formatCurrency(paymentEmailModal.netAmount)}</span>
              </div>
              {(paymentEmailModal.payment.attachments || []).length > 0 && (
                <div className="border-t border-roman-border pt-2 mt-1">
                  <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-1">Anexos incluídos</div>
                  {(paymentEmailModal.payment.attachments || []).map(attachment => (
                    <div key={attachment.id} className="text-xs text-roman-text-sub truncate">• {attachment.name}</div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">
                Destinatários
              </label>
              {paymentEmailModal.recipients.length === 0 && (
                <p className="text-xs text-amber-700 mb-2">Nenhum destinatário configurado. Adicione ao menos um email.</p>
              )}
              <div className="space-y-1.5 mb-3">
                {paymentEmailModal.recipients.map((email, index) => (
                  <div key={index} className="flex items-center justify-between gap-2 rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm">
                    <span className="truncate text-roman-text-main">{email}</span>
                    <button
                      type="button"
                      onClick={() => setPaymentEmailModal(prev => prev ? {
                        ...prev,
                        recipients: prev.recipients.filter((_, i) => i !== index),
                      } : null)}
                      disabled={paymentEmailModal.isSending}
                      className="text-red-600 hover:text-red-800 transition-colors flex-shrink-0 disabled:opacity-50"
                      aria-label={`Remover ${email}`}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={paymentEmailModal.newRecipient}
                  onChange={e => setPaymentEmailModal(prev => prev ? { ...prev, newRecipient: e.target.value } : null)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const email = paymentEmailModal.newRecipient.trim();
                      if (email && email.includes('@') && !paymentEmailModal.recipients.includes(email)) {
                        setPaymentEmailModal(prev => prev ? { ...prev, recipients: [...prev.recipients, email], newRecipient: '' } : null);
                      }
                    }
                  }}
                  disabled={paymentEmailModal.isSending}
                  placeholder="email@exemplo.com"
                  className="flex-1 min-w-0 border border-roman-border rounded-sm px-3 py-2 bg-roman-bg text-sm text-roman-text-main outline-none focus:border-roman-primary disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => {
                    const email = paymentEmailModal.newRecipient.trim();
                    if (email && email.includes('@') && !paymentEmailModal.recipients.includes(email)) {
                      setPaymentEmailModal(prev => prev ? { ...prev, recipients: [...prev.recipients, email], newRecipient: '' } : null);
                    }
                  }}
                  disabled={paymentEmailModal.isSending || !paymentEmailModal.newRecipient.trim().includes('@')}
                  className="flex-shrink-0 px-3 py-2 border border-roman-border rounded-sm text-sm text-roman-text-main hover:bg-roman-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <PlusCircle size={15} /> Adicionar
                </button>
              </div>
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}






