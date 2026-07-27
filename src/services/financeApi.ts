import type {
  MeasurementRecord,
  PaymentRecord,
  ProcurementClassificationSnapshot,
} from '../types';
import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';

export type FinanceCommand =
  | {
      action: 'recordMeasurement';
      ticketId: string;
      idempotencyKey: string;
      payment: PaymentRecord;
      measurement: MeasurementRecord;
      classification?: ProcurementClassificationSnapshot;
    }
  | {
      action: 'settlePayment';
      ticketId: string;
      idempotencyKey: string;
      paymentId: string;
      payment: PaymentRecord;
      grossAmount: number;
      taxAmount: number;
      recipients: string[];
      closureDraft: {
        infrastructureApprovalPrimary: boolean;
        infrastructureApprovalSecondary: boolean;
        serviceStartedAt: string;
        serviceCompletedAt: string;
        guaranteeMonths: string;
        closureNotes: string;
      };
    };

export interface FinanceCommandResult {
  ok: boolean;
  action: FinanceCommand['action'];
  ticketId: string;
  nextStatus: string;
  replayed?: boolean;
  payment?: PaymentRecord;
  measurement?: MeasurementRecord;
  paymentId?: string;
  closed?: boolean;
  remainingPendingPayments?: number;
  outboxKey?: string;
  emailStatus?: 'pending' | 'sent' | 'failed';
}

export interface FinanceEmailOutboxItem {
  id: string;
  ticketId: string;
  paymentId: string | null;
  status: 'pending' | 'processing' | 'failed' | 'dead-letter';
  attempts: number;
  recipients: string[];
  lastError: string | null;
  updatedAt: string | null;
}

export async function fetchFinanceOutbox() {
  const response = await fetch('/api/finance', {
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<{
    ok: boolean;
    emailOutboxByTicket?: Record<string, FinanceEmailOutboxItem[]>;
  }>(response, 'Falha ao buscar e-mails financeiros pendentes.');
  return json.emailOutboxByTicket || {};
}

export async function runFinanceCommand(command: FinanceCommand) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/finance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify(command),
  });
  return expectApiJson<FinanceCommandResult>(
    response,
    'Falha ao processar operação financeira.'
  );
}
