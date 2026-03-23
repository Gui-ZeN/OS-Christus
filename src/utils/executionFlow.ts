import type { PaymentRecord } from '../types';

function clampMilestonePercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

function normalizeProgressPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Number(value));
}

function parseCurrencyValue(raw?: string | null) {
  if (!raw) return 0;
  const normalized = Number(
    String(raw)
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  );
  return Number.isFinite(normalized) ? normalized : 0;
}

export function createExecutionPaymentPlan(_totalValue: number, vendor: string, parts: number) {
  const safeParts = Math.min(5, Math.max(1, Math.round(Number(parts) || 1)));
  let cumulativeMilestone = 0;

  return Array.from({ length: safeParts }, (_, index) => {
    const installmentNumber = index + 1;
    const isLast = installmentNumber === safeParts;
    const isSingleInstallment = safeParts === 1;
    const chunkPercent = isLast
      ? Number((100 - cumulativeMilestone).toFixed(2))
      : Number((100 / safeParts).toFixed(2));
    cumulativeMilestone = Number((cumulativeMilestone + chunkPercent).toFixed(2));

    return {
      id: `payment-${installmentNumber}`,
      vendor,
      // O valor é definido no lançamento do bruto pelo gestor, não no plano.
      value: '',
      label: isSingleInstallment ? 'Parcela única' : `Parcela ${installmentNumber}/${safeParts}`,
      status: 'pending',
      installmentNumber,
      totalInstallments: safeParts,
      releasedPercent: chunkPercent,
      milestonePercent: cumulativeMilestone,
      dueAt: new Date(Date.now() + index * 7 * 24 * 60 * 60 * 1000),
      receiptFileName: null,
    } as PaymentRecord;
  });
}

export function getPaymentFlowMilestones(parts: number) {
  const safeParts = Math.min(5, Math.max(1, Math.round(Number(parts) || 1)));
  let cumulativeMilestone = 0;

  return Array.from({ length: safeParts }, (_, index) => {
    const installmentNumber = index + 1;
    const isLast = installmentNumber === safeParts;
    const chunkPercent = isLast
      ? Number((100 - cumulativeMilestone).toFixed(2))
      : Number((100 / safeParts).toFixed(2));
    cumulativeMilestone = Number((cumulativeMilestone + chunkPercent).toFixed(2));
    return clampMilestonePercent(cumulativeMilestone);
  });
}

export function getApprovedReleasePercent(payments: PaymentRecord[]) {
  return payments
    .filter(payment => payment.status === 'approved' || payment.status === 'paid')
    .reduce((total, payment) => total + Number(payment.releasedPercent || 0), 0);
}

export function getApprovedPaymentValue(payments: PaymentRecord[]) {
  return payments
    .filter(payment => payment.status === 'approved' || payment.status === 'paid')
    .reduce((total, payment) => {
      const grossValue = parseCurrencyValue(payment.grossValue);
      if (grossValue > 0) return total + grossValue;

      const registeredValue = parseCurrencyValue(payment.value);
      if (registeredValue > 0) return total + registeredValue;

      const baseline = parseCurrencyValue(payment.expectedBaselineValue);
      if (baseline > 0) {
        const releasedPercent = Number(payment.releasedPercent || 0);
        return total + (baseline * releasedPercent) / 100;
      }

      return total;
    }, 0);
}

export function applyProgressToPayments(payments: PaymentRecord[], progressPercent: number) {
  const normalizedProgress = normalizeProgressPercent(progressPercent);
  const newlyApproved: PaymentRecord[] = [];

  const nextPayments = payments.map(payment => {
    const milestone = clampMilestonePercent(
      payment.milestonePercent != null
        ? Number(payment.milestonePercent)
        : Number(payment.installmentNumber || 0) * Number(payment.releasedPercent || 0)
    );

    if (payment.status === 'pending' && normalizedProgress >= milestone) {
      const approvedPayment = { ...payment, status: 'approved' } as PaymentRecord;
      newlyApproved.push(approvedPayment);
      return approvedPayment;
    }

    return payment;
  });

  return {
    nextPayments,
    newlyApproved,
    releasedPercent: getApprovedReleasePercent(nextPayments),
    normalizedProgress,
  };
}

export function getNextMilestonePercent(payments: PaymentRecord[]) {
  const nextPending = payments
    .filter(payment => payment.status === 'pending')
    .sort((a, b) => Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0))[0];

  if (!nextPending) return null;

  const milestone = nextPending.milestonePercent != null
    ? Number(nextPending.milestonePercent)
    : Number(nextPending.installmentNumber || 0) * Number(nextPending.releasedPercent || 0);

  return clampMilestonePercent(milestone);
}
