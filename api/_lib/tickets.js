import { Timestamp } from 'firebase-admin/firestore';

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function toDate(value) {
  if (!value) return value;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (isIsoDate(value)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    const seconds = Number(value._seconds || 0);
    return new Date(seconds * 1000);
  }
  return value;
}

export function normalizeTicketForStorage(ticket) {
  const next = { ...ticket };
  next.time = toDate(next.time) || new Date();
  if (next.viewingBy?.at) {
    next.viewingBy = { ...next.viewingBy, at: toDate(next.viewingBy.at) };
  }
  if (next.sla?.dueAt) {
    next.sla = { ...next.sla, dueAt: toDate(next.sla.dueAt) };
  }
  if (Array.isArray(next.history)) {
    next.history = next.history.map(item => ({
      ...item,
      time: toDate(item.time) || new Date(),
    }));
  }
  if (next.preliminaryActions) {
    next.preliminaryActions = {
      ...next.preliminaryActions,
      materialEta: toDate(next.preliminaryActions.materialEta) || null,
      plannedStartAt: toDate(next.preliminaryActions.plannedStartAt) || null,
      actualStartAt: toDate(next.preliminaryActions.actualStartAt) || null,
      updatedAt: toDate(next.preliminaryActions.updatedAt) || new Date(),
    };
  }
  return next;
}

function serializeDate(value) {
  const d = toDate(value);
  if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
  return value ?? null;
}

export function serializeTicketForApi(ticket) {
  return {
    ...ticket,
    time: serializeDate(ticket.time),
    viewingBy: ticket.viewingBy
      ? { ...ticket.viewingBy, at: serializeDate(ticket.viewingBy.at) }
      : null,
    sla: ticket.sla
      ? { ...ticket.sla, dueAt: serializeDate(ticket.sla.dueAt) }
      : null,
    history: Array.isArray(ticket.history)
      ? ticket.history.map(item => ({
          ...item,
          time: serializeDate(item.time),
        }))
      : [],
    preliminaryActions: ticket.preliminaryActions
      ? {
          ...ticket.preliminaryActions,
          materialEta: serializeDate(ticket.preliminaryActions.materialEta),
          plannedStartAt: serializeDate(ticket.preliminaryActions.plannedStartAt),
          actualStartAt: serializeDate(ticket.preliminaryActions.actualStartAt),
          updatedAt: serializeDate(ticket.preliminaryActions.updatedAt),
        }
      : null,
  };
}
