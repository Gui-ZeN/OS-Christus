import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';
import { ContractRecord, PaymentRecord, Quote } from '../types';
import { coerceDate } from '../utils/date';

type QuoteApi = Quote & { ticketId?: string };
type ContractApi = ContractRecord & { ticketId?: string };
type PaymentApi = Omit<PaymentRecord, 'paidAt'> & { paidAt?: string | null; ticketId?: string };

export async function fetchProcurementData() {
  const response = await fetch('/api/procurement', {
    headers: await getAuthenticatedActorHeaders(),
  });
  if (!response.ok) {
    throw new Error('Falha ao buscar procurement.');
  }
  const json = await response.json();
  if (!json.ok) {
    throw new Error('Resposta invalida de procurement.');
  }

  const paymentsByTicket = Object.fromEntries(
    Object.entries(json.paymentsByTicket || {}).map(([ticketId, payment]) => {
      const value = payment as PaymentApi;
      return [
        ticketId,
        {
          ...value,
          paidAt: value.paidAt ? coerceDate(value.paidAt) : null,
        } as PaymentRecord,
      ];
    })
  ) as Record<string, PaymentRecord>;

  return {
    quotesByTicket: (json.quotesByTicket || {}) as Record<string, QuoteApi[]>,
    contractsByTicket: (json.contractsByTicket || {}) as Record<string, ContractApi>,
    paymentsByTicket,
  };
}

export async function saveQuotes(ticketId: string, quotes: Quote[]) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ ticketId, type: 'quotes', quotes }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar cotacoes.');
  }
}

export async function saveContract(ticketId: string, contract: ContractRecord) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ ticketId, type: 'contract', contract }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar contrato.');
  }
}

export async function savePayment(ticketId: string, payment: PaymentRecord) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({
      ticketId,
      type: 'payment',
      payment: {
        ...payment,
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      },
    }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar pagamento.');
  }
}
