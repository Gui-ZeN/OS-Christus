import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseClientApp } from '../lib/firebaseClient';
import type { TicketAttachment } from '../types';

function sanitizeFileName(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function resolveContentType(file: File, fallback: 'application/pdf' | 'image/png' = 'application/pdf') {
  const explicit = String(file.type || '').trim().toLowerCase();
  if (explicit) return explicit;
  const lowerName = String(file.name || '').trim().toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  return fallback;
}

export async function uploadClosureDocument(ticketId: string, file: File): Promise<TicketAttachment> {
  const app = getFirebaseClientApp();
  if (!app) {
    throw new Error('Firebase Storage não configurado no frontend.');
  }

  const storage = getStorage(app);
  const contentType = resolveContentType(file, 'application/pdf');
  const safeName = sanitizeFileName(file.name) || `anexo-${Date.now()}`;
  const isPdf = contentType === 'application/pdf';
  const baseFolder = isPdf ? 'attachments/tickets/pdfs' : 'attachments/tickets/images';
  const path = `${baseFolder}/${ticketId}/closure-${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType,
  });
  const url = await getDownloadURL(storageRef);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    path,
    url,
    contentType,
    size: file.size,
    uploadedAt: new Date(),
    category: isPdf ? 'closure_report' : 'closure_evidence',
  };
}

export async function uploadPaymentAttachment(ticketId: string, paymentId: string, file: File): Promise<TicketAttachment> {
  const app = getFirebaseClientApp();
  if (!app) {
    throw new Error('Firebase Storage não configurado no frontend.');
  }

  const storage = getStorage(app);
  const contentType = resolveContentType(file, 'application/pdf');
  const safeName = sanitizeFileName(file.name) || `anexo-${Date.now()}`;
  const path = `attachments/tickets/payments/${ticketId}/${paymentId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType,
  });
  const url = await getDownloadURL(storageRef);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    path,
    url,
    contentType,
    size: file.size,
    uploadedAt: new Date(),
    category: 'attachment',
  };
}

export async function uploadQuoteAttachment(
  ticketId: string,
  roundKey: string,
  quoteId: string,
  file: File
): Promise<TicketAttachment> {
  const app = getFirebaseClientApp();
  if (!app) {
    throw new Error('Firebase Storage não configurado no frontend.');
  }

  const storage = getStorage(app);
  const contentType = resolveContentType(file, 'application/pdf');
  const safeName = sanitizeFileName(file.name) || `anexo-${Date.now()}`;
  const path = `attachments/tickets/quotes/${ticketId}/${roundKey}/${quoteId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType,
  });
  const url = await getDownloadURL(storageRef);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    path,
    url,
    contentType,
    size: file.size,
    uploadedAt: new Date(),
    category: 'attachment',
  };
}

export async function uploadContractAttachment(ticketId: string, file: File): Promise<TicketAttachment> {
  const app = getFirebaseClientApp();
  if (!app) {
    throw new Error('Firebase Storage não configurado no frontend.');
  }

  const storage = getStorage(app);
  const contentType = resolveContentType(file, 'application/pdf');
  const safeName = sanitizeFileName(file.name) || `contrato-${Date.now()}`;
  const path = `attachments/tickets/contracts/${ticketId}/${Date.now()}-${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType,
  });
  const url = await getDownloadURL(storageRef);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    path,
    url,
    contentType,
    size: file.size,
    uploadedAt: new Date(),
    category: 'attachment',
  };
}

export async function deleteTicketAttachment(path: string) {
  const app = getFirebaseClientApp();
  if (!app) {
    throw new Error('Firebase Storage não configurado no frontend.');
  }

  const storage = getStorage(app);
  await deleteObject(ref(storage, path));
}
