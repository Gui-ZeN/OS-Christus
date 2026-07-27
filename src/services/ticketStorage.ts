import type { TicketAttachment } from '../types';
import { getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';

function resolveContentType(file: File, fallback = 'application/octet-stream') {
  const explicit = String(file.type || '').trim().toLowerCase();
  if (explicit) return explicit;
  const lowerName = String(file.name || '').trim().toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.gif')) return 'image/gif';
  if (lowerName.endsWith('.bmp')) return 'image/bmp';
  if (lowerName.endsWith('.svg')) return 'image/svg+xml';
  if (lowerName.endsWith('.doc')) return 'application/msword';
  if (lowerName.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lowerName.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lowerName.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lowerName.endsWith('.xml')) return 'application/xml';
  if (lowerName.endsWith('.csv')) return 'text/csv';
  if (lowerName.endsWith('.txt')) return 'text/plain';
  return fallback;
}

type AttachmentUploadScope = 'closure' | 'payment' | 'measurement' | 'quote' | 'contract' | 'message';

interface AttachmentUploadOptions {
  paymentId?: string;
  measurementId?: string;
  roundKey?: string;
  quoteId?: string;
  channel?: 'internal' | 'public' | 'director';
}

type ApiAttachment = Omit<TicketAttachment, 'uploadedAt'> & { uploadedAt?: string | null };

async function uploadProtectedAttachment(
  ticketId: string,
  scope: AttachmentUploadScope,
  file: File,
  options: AttachmentUploadOptions = {}
): Promise<TicketAttachment> {
  const contentType = resolveContentType(file);
  // Some browsers omit File.type. Keep filename-derived metadata only so the
  // server can still validate the actual file signature before storage.
  const uploadFile = contentType === file.type
    ? file
    : new File([file], file.name, { type: contentType, lastModified: file.lastModified });
  const body = new FormData();
  body.set('ticketId', ticketId);
  body.set('scope', scope);
  if (options.paymentId) body.set('paymentId', options.paymentId);
  if (options.measurementId) body.set('measurementId', options.measurementId);
  if (options.roundKey) body.set('roundKey', options.roundKey);
  if (options.quoteId) body.set('quoteId', options.quoteId);
  if (options.channel) body.set('channel', options.channel);
  body.set('attachment', uploadFile);

  const response = await fetch('/api/attachments', {
    method: 'POST',
    headers: await getAuthenticatedActorHeaders(),
    body,
  });
  const json = await expectApiJson<{ ok: boolean; attachment?: ApiAttachment }>(
    response,
    'Falha ao enviar o anexo.'
  );
  if (!json.ok || !json.attachment) throw new Error('Resposta invalida ao enviar o anexo.');
  return {
    ...json.attachment,
    uploadedAt: json.attachment.uploadedAt ? new Date(json.attachment.uploadedAt) : new Date(),
  };
}

export async function uploadClosureDocument(ticketId: string, file: File): Promise<TicketAttachment> {
  return uploadProtectedAttachment(ticketId, 'closure', file);
}

export async function uploadPaymentAttachment(ticketId: string, paymentId: string, file: File): Promise<TicketAttachment> {
  return uploadProtectedAttachment(ticketId, 'payment', file, { paymentId });
}

export async function uploadMeasurementAttachment(ticketId: string, measurementId: string, file: File): Promise<TicketAttachment> {
  return uploadProtectedAttachment(ticketId, 'measurement', file, { measurementId });
}

export async function uploadQuoteAttachment(
  ticketId: string,
  roundKey: string,
  quoteId: string,
  file: File
): Promise<TicketAttachment> {
  return uploadProtectedAttachment(ticketId, 'quote', file, { roundKey, quoteId });
}

export async function uploadContractAttachment(ticketId: string, file: File): Promise<TicketAttachment> {
  return uploadProtectedAttachment(ticketId, 'contract', file);
}

export async function uploadMessageAttachment(
  ticketId: string,
  channel: 'internal' | 'public' | 'director',
  file: File
): Promise<TicketAttachment> {
  return uploadProtectedAttachment(ticketId, 'message', file, { channel });
}

export async function deleteTicketAttachment(path: string) {
  const normalizedPath = String(path || '').trim();
  const parts = normalizedPath.split('/');
  const ticketId = parts[3] || '';
  if (!ticketId || parts[0] !== 'attachments' || parts[1] !== 'tickets') {
    throw new Error('Caminho de anexo invalido.');
  }
  const query = new URLSearchParams({ ticketId, path: normalizedPath });
  const response = await fetch(`/api/attachments?${query.toString()}`, {
    method: 'DELETE',
    headers: await getAuthenticatedActorHeaders(),
  });
  await expectApiJson(response, 'Falha ao excluir o anexo.');
}
