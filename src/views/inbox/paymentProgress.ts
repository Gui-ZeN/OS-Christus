import type { ContractRecord, PaymentRecord } from '../../types';
import { parseCurrency as parseCurrencyInput } from '../../utils/currency';

// Helpers de pagamento/progresso — extraídos do InboxView.

export function isLegacyFlowPlaceholderPayment(payment: PaymentRecord) {
  const hasGross = parseCurrencyInput(payment.grossValue || '') > 0;
  const hasValue = parseCurrencyInput(payment.value || '') > 0;
  const hasTax = parseCurrencyInput(payment.taxValue || '') > 0;
  const hasNet = parseCurrencyInput(payment.netValue || '') > 0;
  const hasMeasurementLink = Boolean(payment.measurementId);
  const hasAttachments = Array.isArray(payment.attachments) && payment.attachments.length > 0;
  const hasReceipt = Boolean(payment.receiptFileName);
  const isUnpaidStatus = payment.status === 'pending' || payment.status === 'approved';
  return isUnpaidStatus && !hasGross && !hasValue && !hasTax && !hasNet && !hasMeasurementLink && !hasAttachments && !hasReceipt;
}

export function stripLegacyFlowPlaceholders(payments: PaymentRecord[]) {
  return payments.filter(payment => !isLegacyFlowPlaceholderPayment(payment));
}

export function roundProgressPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function resolveExpectedBaselineValue(contract?: ContractRecord, payments: PaymentRecord[] = []) {
  const contractInitial = parseCurrencyInput(contract?.initialPlannedValue || '');
  if (contractInitial > 0) return contractInitial;

  const paymentBaseline = parseCurrencyInput(payments[0]?.expectedBaselineValue || '');
  if (paymentBaseline > 0) return paymentBaseline;

  const contractValue = parseCurrencyInput(contract?.value || '');
  if (contractValue > 0) return contractValue;

  return parseCurrencyInput(payments[0]?.value || '');
}

export function calculateProgressPercentFromGross(grossAmount: number, baselineValue: number) {
  if (!Number.isFinite(grossAmount) || grossAmount < 0 || baselineValue <= 0) return 0;
  return roundProgressPercent((grossAmount / baselineValue) * 100);
}

export function getBudgetSourceLabel(source: 'initial' | 'additive' | null | undefined) {
  return source === 'additive' ? 'Aditivo' : 'Orçamento inicial';
}
