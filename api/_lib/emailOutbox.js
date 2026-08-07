import { toDateOrNull } from './dates.js';
import { randomUUID } from 'node:crypto';
import { HttpError } from './http.js';
import { notificationTtlAt } from './notificationState.js';

const OUTBOX_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
export const DELIVERY_LEASE_MS = 2 * 60 * 1000;
export const MAX_EMAIL_OUTBOX_ATTEMPTS = 6;

// Tipos de e-mail que a fila sabe entregar. Cada tipo tem um renderizador de
// payload no mail.js (buildOutboxPayload). Manter como allow-list: um doc com tipo
// desconhecido nunca é reivindicado (falha fechada) em vez de virar envio errado.
export const EMAIL_OUTBOX_TYPES = Object.freeze({
  FINANCE_PAYMENT: 'finance.payment',
  MANAGER_NEW_TICKET: 'ticket.manager-notification',
});
const KNOWN_EMAIL_OUTBOX_TYPES = new Set(Object.values(EMAIL_OUTBOX_TYPES));

export function isKnownEmailOutboxType(type) {
  return KNOWN_EMAIL_OUTBOX_TYPES.has(String(type || ''));
}

// Rótulo humano por tipo — usado no alerta de dead-letter (antes o texto era
// fixo em "e-mail financeiro", o que passou a mentir com a fila generalizada).
export function describeEmailOutboxType(type) {
  switch (String(type || '')) {
    case EMAIL_OUTBOX_TYPES.FINANCE_PAYMENT:
      return 'O e-mail financeiro';
    case EMAIL_OUTBOX_TYPES.MANAGER_NEW_TICKET:
      return 'O aviso de nova OS ao gestor';
    default:
      return 'Um e-mail da fila';
  }
}
const RETRY_DELAYS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  4 * 60 * 60 * 1000,
];

export function normalizeOutboxKey(value) {
  const key = String(value || '').trim();
  if (!OUTBOX_KEY_PATTERN.test(key)) {
    throw new HttpError(400, 'outboxKey inválida.');
  }
  return key;
}

export function isEmailOutboxLeaseActive(data, now = new Date()) {
  const leaseAt = toDateOrNull(data?.leaseAt);
  return Boolean(
    data?.status === 'processing' &&
    leaseAt &&
    leaseAt.getTime() + DELIVERY_LEASE_MS > now.getTime()
  );
}

export function getEmailOutboxRetryDelayMs(attempts) {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Number(attempts || 1) - 1));
  return RETRY_DELAYS_MS[index];
}

export function isEmailOutboxEligible(data, now = new Date()) {
  const status = String(data?.status || 'pending');
  const attempts = Number(data?.attempts || 0);
  if (status === 'sent' || status === 'dead-letter' || attempts >= MAX_EMAIL_OUTBOX_ATTEMPTS) {
    return false;
  }
  if (status === 'processing') return !isEmailOutboxLeaseActive(data, now);
  if (status === 'pending') return true;
  if (status !== 'failed') return false;

  const nextAttemptAt = toDateOrNull(data?.nextAttemptAt);
  return !nextAttemptAt || nextAttemptAt.getTime() <= now.getTime();
}

export async function claimEmailOutbox(db, ticketId, outboxKey, options = {}) {
  const key = normalizeOutboxKey(outboxKey);
  const ref = db.collection('emailOutbox').doc(`${ticketId}__${key}`);
  const leaseToken = randomUUID();
  const respectSchedule = options.respectSchedule === true;
  const allowDeadLetterRetry = options.allowDeadLetterRetry === true;

  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, 'E-mail pendente não encontrado.');
    const data = snap.data() || {};
    if (data.ticketId !== ticketId || !isKnownEmailOutboxType(data.type)) {
      throw new HttpError(409, 'E-mail pendente incompatível com esta OS.');
    }
    if (data.status === 'sent') {
      return { state: 'sent', data, ref };
    }
    if (
      !allowDeadLetterRetry &&
      (data.status === 'dead-letter' ||
        Number(data.attempts || 0) >= MAX_EMAIL_OUTBOX_ATTEMPTS)
    ) {
      return { state: 'dead-letter', data, ref };
    }

    if (isEmailOutboxLeaseActive(data)) {
      return { state: 'busy', data, ref };
    }
    if (respectSchedule && !isEmailOutboxEligible(data)) {
      return { state: 'deferred', data, ref };
    }

    const now = new Date();
    tx.set(ref, {
      status: 'processing',
      leaseToken,
      leaseAt: now,
      attempts: Number(data.attempts || 0) + 1,
      lastError: null,
      nextAttemptAt: null,
      updatedAt: now,
    }, { merge: true });
    return { state: 'claimed', data, ref, leaseToken };
  });

  return result;
}

export async function markEmailOutboxSent(ref, leaseToken, delivery) {
  const now = new Date();
  await ref.firestore.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.status === 'sent') return;
    if (data.leaseToken !== leaseToken) {
      throw new HttpError(409, 'A tentativa de entrega não possui mais o bloqueio da outbox.');
    }
    tx.set(ref, {
      status: 'sent',
      sentAt: now,
      messageId: delivery?.messageId || null,
      provider: delivery?.provider || null,
      leaseToken: null,
      leaseAt: null,
      lastError: null,
      updatedAt: now,
    }, { merge: true });
  });
}

export async function markEmailOutboxFailed(ref, leaseToken, error) {
  if (!ref || !leaseToken) return;
  const now = new Date();
  await ref.firestore.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.status === 'sent' || data.leaseToken !== leaseToken) return;
    const attempts = Number(data.attempts || 0);
    const isDeadLetter = attempts >= MAX_EMAIL_OUTBOX_ATTEMPTS;
    tx.set(ref, {
      status: isDeadLetter ? 'dead-letter' : 'failed',
      leaseToken: null,
      leaseAt: null,
      lastError: String(error?.message || error || 'Falha ao enviar e-mail.').slice(0, 1000),
      lastFailedAt: now,
      nextAttemptAt: isDeadLetter
        ? null
        : new Date(now.getTime() + getEmailOutboxRetryDelayMs(attempts)),
      deadLetterAt: isDeadLetter ? now : null,
      updatedAt: now,
    }, { merge: true });
    if (isDeadLetter) {
      tx.set(ref.firestore.collection('notifications').doc(`outbox-${ref.id}`), {
        type: 'alert',
        ticketId: data.ticketId || null,
        title: `Falha definitiva no envio - ${data.ticketId || 'Serv3'}`,
        body: `${describeEmailOutboxType(data.type)} atingiu o limite de tentativas e precisa de intervenção administrativa.`,
        audienceRoles: ['Admin', 'Gestor'],
        action: data.ticketId
          ? data.type === EMAIL_OUTBOX_TYPES.FINANCE_PAYMENT
            ? { label: 'Abrir financeiro', view: 'finance', ticketId: data.ticketId }
            : { label: 'Abrir OS', view: 'inbox', ticketId: data.ticketId }
          : null,
        createdAt: now,
        updatedAt: now,
        ttlAt: notificationTtlAt(now),
      }, { merge: true });
    }
  });
}
