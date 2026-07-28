import { TICKET_STATUS } from '../constants/ticketStatus';
import { parseCurrency } from './currency';
import { getApprovedReleasePercent } from './executionFlow';
import type { ContractRecord, GuaranteeInfo, MeasurementRecord, PaymentRecord, Ticket } from '../types';

/**
 * Regras PURAS de cálculo e rótulo do fluxo financeiro — extraídas do god-file
 * `src/views/FinanceView.tsx`. É aqui que mora o dinheiro da obra: baseline,
 * progresso, bruto acumulado, somas e a montagem dos lançamentos a partir das
 * medições. Sem React e sem I/O: dá para testar direto.
 */

export function roundProgressPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function resolveExpectedBaselineValue(contract?: ContractRecord, payments: PaymentRecord[] = []) {
  const contractInitial = parseCurrency(contract?.initialPlannedValue || '');
  if (contractInitial > 0) return contractInitial;

  const paymentBaseline = parseCurrency(payments[0]?.expectedBaselineValue || '');
  if (paymentBaseline > 0) return paymentBaseline;

  const contractValue = parseCurrency(contract?.value || '');
  if (contractValue > 0) return contractValue;

  return parseCurrency(payments[0]?.value || '');
}

export function calculateProgressPercentFromGross(grossAmount: number, baselineValue: number) {
  if (!Number.isFinite(grossAmount) || grossAmount < 0 || baselineValue <= 0) return 0;
  return roundProgressPercent((grossAmount / baselineValue) * 100);
}

// Bruto acumulado da obra. Prioriza a SOMA REAL dos grossValue das medições (sem
// drift de arredondamento — reconstruir de `baseline × percent` com o percent a 2
// casas fazia o erro compor: 30k + três 10k dava 33,33→66,66→99,99, travando a obra
// 100% paga em 99,99%). Math.max com a reconstrução é a rede para dados LEGADOS:
// medições antigas sem `grossValue` (ou contrato sem baseline) fariam a soma zerar e
// o guard travar a OS — nesse caso a reconstrução (maior) prevalece (comportamento antigo).
export function resolveAccumulatedGross(
  measurements: MeasurementRecord[],
  baselineValue: number,
  currentPercent: number
) {
  const exactSum = (measurements || []).reduce(
    (sum, measurement) => sum + parseCurrency(measurement?.grossValue || ''),
    0
  );
  const reconstructed = baselineValue > 0 ? (baselineValue * (currentPercent || 0)) / 100 : 0;
  return Math.max(exactSum, reconstructed);
}

export function getBudgetSourceLabel(source: 'initial' | 'additive' | null | undefined) {
  return source === 'additive' ? 'Aditivo' : 'Orçamento inicial';
}

export function formatDateLabel(date?: Date | null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Não definido';
  return date.toLocaleDateString('pt-BR');
}

export function getAttachmentPreviewKind(contentType?: string | null, name?: string | null) {
  const normalizedType = String(contentType || '').toLowerCase();
  const normalizedName = String(name || '').toLowerCase();
  if (normalizedType.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/.test(normalizedName)) return 'image' as const;
  if (normalizedType === 'application/pdf' || normalizedName.endsWith('.pdf')) return 'pdf' as const;
  return 'file' as const;
}

export function formatInputDate(date?: Date | null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function sumReleasedPercent(payments: PaymentRecord[]) {
  return getApprovedReleasePercent(payments);
}

export function sumPaidValue(payments: PaymentRecord[]) {
  return payments
    .filter(payment => payment.status === 'paid')
    .reduce((total, payment) => total + parseCurrency(payment.grossValue || payment.value), 0);
}

export function sumPlannedValue(payments: PaymentRecord[]) {
  return payments.reduce((total, payment) => total + parseCurrency(payment.value), 0);
}

export function normalizeStatusLabel(status: string) {
  if (status === 'paid') return 'Pago';
  if (status === 'approved') return 'Liberada';
  return 'Pendente';
}

export function isLegacyMilestonePlaceholder(payment: PaymentRecord) {
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

export function sortPaymentsByInstallment(a: PaymentRecord, b: PaymentRecord) {
  const installmentA = Number(a.installmentNumber || Number.MAX_SAFE_INTEGER);
  const installmentB = Number(b.installmentNumber || Number.MAX_SAFE_INTEGER);
  if (installmentA !== installmentB) return installmentA - installmentB;
  const dueA = a.dueAt instanceof Date ? a.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
  const dueB = b.dueAt instanceof Date ? b.dueAt.getTime() : Number.MAX_SAFE_INTEGER;
  if (dueA !== dueB) return dueA - dueB;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function buildDynamicPaymentsFromMeasurements(
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
        attachments: Array.isArray(measurement.attachments) ? measurement.attachments : [],
        receiptFileName: null,
      } as PaymentRecord;
    });
}

export function getEffectiveDynamicPayments(
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

export function upsertDynamicPayment(rawPayments: PaymentRecord[], nextPayment: PaymentRecord) {
  const nonLegacyPayments = rawPayments.filter(payment => !isLegacyMilestonePlaceholder(payment));
  const existingIndex = nonLegacyPayments.findIndex(payment => payment.id === nextPayment.id);
  if (existingIndex >= 0) {
    const updated = [...nonLegacyPayments];
    updated[existingIndex] = nextPayment;
    return updated.sort(sortPaymentsByInstallment);
  }
  return [...nonLegacyPayments, nextPayment].sort(sortPaymentsByInstallment);
}

export function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getGuaranteeDaysRemaining(guarantee?: GuaranteeInfo | null) {
  if (!guarantee?.endAt || Number.isNaN(guarantee.endAt.getTime())) return null;
  const today = startOfToday();
  const end = startOfToday();
  end.setFullYear(guarantee.endAt.getFullYear(), guarantee.endAt.getMonth(), guarantee.endAt.getDate());
  const diffMs = end.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function isTicketInGuarantee(guarantee?: GuaranteeInfo | null) {
  const remainingDays = getGuaranteeDaysRemaining(guarantee);
  return remainingDays != null && remainingDays >= 0;
}

export function getFinanceNextActionLabel(ticket: Ticket) {
  if (ticket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS) return 'Concluir ações preliminares e liberar o início da execução.';
  if (ticket.status === TICKET_STATUS.IN_PROGRESS) return 'Atualizar o andamento da obra e liberar os próximos marcos.';
  if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) return 'Aguardar validação do solicitante para seguir o fechamento financeiro.';
  if (ticket.status === TICKET_STATUS.WAITING_PAYMENT) return 'Concluir lançamentos pendentes e finalizar o encerramento.';
  if (ticket.status === TICKET_STATUS.CLOSED) return 'Fluxo financeiro concluído.';
  if (ticket.status === TICKET_STATUS.CANCELED) return 'OS cancelada; manter apenas consulta histórica.';
  return 'Acompanhar evolução da OS e próximos marcos financeiros.';
}
