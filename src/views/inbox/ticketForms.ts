import type { Ticket } from '../../types';
import { formatInputDateTime } from '../../utils/date';

/**
 * Estado inicial dos formularios da OS (execucao, andamento, dados) — extraidos do
 * god-file `src/views/InboxView.tsx`. Sao a ponte entre o documento salvo e os
 * <input> da tela: definem os defaults e o formato que cada campo espera.
 */

export interface ExecutionSetupFormState {
  paymentFlowParts: string;
  measurementSheetUrl: string;
  notes: string;
}

export interface ProgressUpdateFormState {
  grossAmount: string;
  budgetSource: 'initial' | 'additive';
  notes: string;
}

export interface TicketDetailsFormState {
  subject: string;
  requester: string;
  requesterEmail: string;
  time: string;
  sector: string;
  location: string;
  macroServiceId: string;
  serviceCatalogId: string;
}

export function createExecutionSetupFormState(ticket?: Ticket): ExecutionSetupFormState {
  return {
    paymentFlowParts: String(ticket?.executionProgress?.paymentFlowParts || 5),
    measurementSheetUrl: ticket?.executionProgress?.measurementSheetUrl || '',
    notes: '',
  };
}

// Sempre em branco: o andamento e um lancamento NOVO a cada atualizacao, nao a
// edicao do anterior — por isso o ticket entra so para manter a assinatura.
export function createProgressUpdateFormState(_ticket?: Ticket): ProgressUpdateFormState {
  return {
    grossAmount: '',
    budgetSource: 'initial',
    notes: '',
  };
}

export function createTicketDetailsFormState(ticket?: Ticket): TicketDetailsFormState {
  return {
    subject: ticket?.subject || '',
    requester: ticket?.requester || '',
    requesterEmail: ticket?.requesterEmail || '',
    time: formatInputDateTime(ticket?.time),
    sector: ticket?.sector || '',
    location: ticket?.location || '',
    macroServiceId: ticket?.macroServiceId || '',
    serviceCatalogId: ticket?.serviceCatalogId || '',
  };
}
