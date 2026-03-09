import type { PaymentRecord } from '../types';

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

export function createExecutionPaymentPlan(totalValue: number, vendor: string, parts: number) {
  const safeParts = Math.min(5, Math.max(1, Math.round(Number(parts) || 1)));
  const normalizedTotal = Math.max(0, Number(totalValue) || 0);
  const baseValue = Math.floor((normalizedTotal / safeParts) * 100) / 100;
  let cumulativeMilestone = 0;

  return Array.from({ length: safeParts }, (_, index) => {
    const installmentNumber = index + 1;
    const isLast = installmentNumber === safeParts;
    const rawValue = isLast ? normalizedTotal - baseValue * (safeParts - 1) : baseValue;
    const chunkPercent = isLast
      ? Number((100 - cumulativeMilestone).toFixed(2))
      : Number((100 / safeParts).toFixed(2));
    cumulativeMilestone = Number((cumulativeMilestone + chunkPercent).toFixed(2));

    return {
      id: `payment-${installmentNumber}`,
      vendor,
      value: formatCurrency(rawValue),
      label: safeParts === 1 ? 'Pagamento à vista' : `Parcela ${installmentNumber}/${safeParts}`,
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

export function getApprovedReleasePercent(payments: PaymentRecord[]) {
  return payments
    .filter(payment => payment.status === 'approved' || payment.status === 'paid')
    .reduce((total, payment) => total + Number(payment.releasedPercent || 0), 0);
}

export function getApprovedPaymentValue(payments: PaymentRecord[]) {
  return payments
    .filter(payment => payment.status === 'approved' || payment.status === 'paid')
    .reduce((total, payment) => {
      const normalized = Number(
        String(payment.value || '')
          .replace(/[^\d,.-]/g, '')
          .replace(/\./g, '')
          .replace(',', '.')
      );
      return total + (Number.isFinite(normalized) ? normalized : 0);
    }, 0);
}

export function applyProgressToPayments(payments: PaymentRecord[], progressPercent: number) {
  const normalizedProgress = clampPercent(progressPercent);
  const newlyApproved: PaymentRecord[] = [];

  const nextPayments = payments.map(payment => {
    const milestone = clampPercent(
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

  return clampPercent(milestone);
}
