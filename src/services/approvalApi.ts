import { expectApiJson } from './apiClient';
import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';

export type ApprovalCommand =
  | { action: 'approveSolution'; ticketId: string; idempotencyKey: string }
  | { action: 'rejectSolution'; ticketId: string; idempotencyKey: string; reason: string }
  | { action: 'approveBudget'; ticketId: string; idempotencyKey: string; selectedQuoteId: string }
  | {
      action: 'rejectBudget';
      ticketId: string;
      idempotencyKey: string;
      reason: string;
      roundCategory: 'initial' | 'additive';
      roundInitialIndex?: number | null;
      roundAdditiveIndex?: number | null;
    }
  | { action: 'approveContract'; ticketId: string; idempotencyKey: string; contractId: string }
  | { action: 'rejectContract'; ticketId: string; idempotencyKey: string; contractId: string; reason: string };

export interface ApprovalCommandResult {
  ok: boolean;
  action: ApprovalCommand['action'];
  ticketId: string;
  nextStatus: string;
  replayed?: boolean;
  selectedQuoteId?: string | number | null;
  additivePaymentCreated?: boolean;
  contractId?: string;
}

export async function runApprovalCommand(command: ApprovalCommand) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify(command),
  });
  return expectApiJson<ApprovalCommandResult>(response, 'Falha ao processar decisão da Diretoria.');
}
