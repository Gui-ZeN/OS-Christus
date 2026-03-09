import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';
import { ContractRecord, MeasurementRecord, PaymentRecord, ProcurementClassificationSnapshot, Quote } from '../types';
import { coerceDate } from '../utils/date';

type QuoteApi = Quote & { ticketId?: string };
type ContractApi = ContractRecord & { ticketId?: string };
type PaymentApi = Omit<PaymentRecord, 'paidAt' | 'dueAt'> & { paidAt?: string | null; dueAt?: string | null; ticketId?: string };
type MeasurementApi = Omit<MeasurementRecord, 'requestedAt' | 'approvedAt'> & {
  requestedAt?: string | null;
  approvedAt?: string | null;
  ticketId?: string;
};

export async function fetchProcurementData() {
  const response = await fetch('/api/procurement', {
    headers: await getAuthenticatedActorHeaders(),
  });
  if (!response.ok) {
    throw new Error('Falha ao buscar procurement.');
  }
  const json = await response.json();
  if (!json.ok) {
    throw new Error('Resposta inválida de procurement.');
  }

  const paymentsByTicket = Object.fromEntries(
    Object.entries(json.paymentsByTicket || {}).map(([ticketId, payments]) => {
      const values = Array.isArray(payments) ? payments as PaymentApi[] : [payments as PaymentApi];
      return [
        ticketId,
        values.map(value => ({
          ...value,
          paidAt: value.paidAt ? coerceDate(value.paidAt) : null,
          dueAt: value.dueAt ? coerceDate(value.dueAt) : null,
        })) as PaymentRecord[],
      ];
    })
  ) as Record<string, PaymentRecord[]>;

  const measurementsByTicket = Object.fromEntries(
    Object.entries(json.measurementsByTicket || {}).map(([ticketId, measurements]) => {
      const values = Array.isArray(measurements) ? measurements as MeasurementApi[] : [measurements as MeasurementApi];
      return [
        ticketId,
        values.map(value => ({
          ...value,
          requestedAt: value.requestedAt ? coerceDate(value.requestedAt) : null,
          approvedAt: value.approvedAt ? coerceDate(value.approvedAt) : null,
        })) as MeasurementRecord[],
      ];
    })
  ) as Record<string, MeasurementRecord[]>;

  return {
    quotesByTicket: (json.quotesByTicket || {}) as Record<string, QuoteApi[]>,
    contractsByTicket: (json.contractsByTicket || {}) as Record<string, ContractApi>,
    paymentsByTicket,
    measurementsByTicket,
  };
}

export async function saveQuotes(ticketId: string, quotes: Quote[], classification?: ProcurementClassificationSnapshot) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ ticketId, type: 'quotes', quotes, classification }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar cotações.');
  }
}

export async function saveContract(ticketId: string, contract: ContractRecord, classification?: ProcurementClassificationSnapshot) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ ticketId, type: 'contract', contract, classification }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar contrato.');
  }
}

export async function savePayment(ticketId: string, payment: PaymentRecord, classification?: ProcurementClassificationSnapshot) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({
      ticketId,
      type: 'payment',
      classification,
      payment: {
        ...payment,
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
        dueAt: payment.dueAt ? payment.dueAt.toISOString() : null,
      },
    }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar pagamento.');
  }
}

export async function saveMeasurement(ticketId: string, measurement: MeasurementRecord, classification?: ProcurementClassificationSnapshot) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({
      ticketId,
      type: 'measurement',
      classification,
      measurement: {
        ...measurement,
        requestedAt: measurement.requestedAt ? measurement.requestedAt.toISOString() : null,
        approvedAt: measurement.approvedAt ? measurement.approvedAt.toISOString() : null,
      },
    }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar medição.');
  }
}

