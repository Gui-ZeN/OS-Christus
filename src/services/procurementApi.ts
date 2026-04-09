import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';
import { ContractRecord, MeasurementRecord, PaymentRecord, ProcurementClassificationSnapshot, Quote } from '../types';
import { coerceDate } from '../utils/date';

type QuoteApi = Quote & { ticketId?: string };
type ContractApi = ContractRecord & { ticketId?: string };
type PaymentApi = Omit<PaymentRecord, 'paidAt' | 'dueAt' | 'attachments'> & {
  paidAt?: string | null;
  dueAt?: string | null;
  ticketId?: string;
  attachments?: Array<{
    id: string;
    name: string;
    path: string;
    url: string;
    contentType?: string | null;
    size?: number | null;
    uploadedAt?: string | null;
    category?: 'closure_report' | 'closure_evidence' | 'attachment';
  }> | null;
};
type MeasurementApi = Omit<MeasurementRecord, 'requestedAt' | 'approvedAt'> & {
  requestedAt?: string | null;
  approvedAt?: string | null;
  attachments?: Array<{
    id: string;
    name: string;
    path: string;
    url: string;
    contentType?: string | null;
    size?: number | null;
    uploadedAt?: string | null;
    category?: 'closure_report' | 'closure_evidence' | 'attachment';
  }> | null;
  ticketId?: string;
};

export async function fetchProcurementData() {
  const response = await fetch('/api/procurement', {
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<any>(response, 'Falha ao buscar dados financeiros.');
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
          attachments: Array.isArray(value.attachments)
            ? value.attachments.map(item => ({
                ...item,
                uploadedAt: item?.uploadedAt ? coerceDate(item.uploadedAt) : null,
              }))
            : [],
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
          attachments: Array.isArray(value.attachments)
            ? value.attachments.map(item => ({
                ...item,
                uploadedAt: item?.uploadedAt ? coerceDate(item.uploadedAt) : null,
              }))
            : [],
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
  await expectApiJson(response, 'Falha ao salvar cotações.');
}

export async function saveContract(ticketId: string, contract: ContractRecord, classification?: ProcurementClassificationSnapshot) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/procurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ ticketId, type: 'contract', contract, classification }),
  });
  await expectApiJson(response, 'Falha ao salvar contrato.');
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
  await expectApiJson(response, 'Falha ao salvar pagamento.');
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
        attachments: Array.isArray(measurement.attachments)
          ? measurement.attachments.map(item => ({
              ...item,
              uploadedAt: item?.uploadedAt ? item.uploadedAt.toISOString() : null,
            }))
          : [],
        requestedAt: measurement.requestedAt ? measurement.requestedAt.toISOString() : null,
        approvedAt: measurement.approvedAt ? measurement.approvedAt.toISOString() : null,
      },
    }),
  });
  await expectApiJson(response, 'Falha ao salvar medição.');
}



