import { Timestamp } from 'firebase-admin/firestore';

function parseTicketSequence(value) {
  const match = String(value || '').match(/^OS-(\d+)$/i);
  return match ? Number(match[1] || 0) : 0;
}

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

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value
      .map(stripUndefinedDeep)
      .filter(item => item !== undefined);
  }

  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Timestamp)) {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = stripUndefinedDeep(entry);
      if (normalized !== undefined) {
        next[key] = normalized;
      }
    }
    return next;
  }

  return value === undefined ? undefined : value;
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
      attachments: Array.isArray(item?.attachments)
        ? item.attachments.map(attachment => ({
            ...attachment,
            uploadedAt: toDate(attachment?.uploadedAt) || null,
          }))
        : undefined,
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
  if (next.closureChecklist) {
    const infrastructureApprovalPrimary =
      next.closureChecklist.infrastructureApprovalPrimary ??
      next.closureChecklist.infrastructureApprovedByRafael ??
      false;
    const infrastructureApprovalSecondary =
      next.closureChecklist.infrastructureApprovalSecondary ??
      next.closureChecklist.infrastructureApprovedByFernando ??
      false;
    next.closureChecklist = {
      ...next.closureChecklist,
      infrastructureApprovalPrimary: Boolean(infrastructureApprovalPrimary),
      infrastructureApprovalSecondary: Boolean(infrastructureApprovalSecondary),
      requesterApprovedAt: toDate(next.closureChecklist.requesterApprovedAt) || null,
      serviceStartedAt: toDate(next.closureChecklist.serviceStartedAt) || null,
      serviceCompletedAt: toDate(next.closureChecklist.serviceCompletedAt) || null,
      closedAt: toDate(next.closureChecklist.closedAt) || null,
      documents: Array.isArray(next.closureChecklist.documents)
        ? next.closureChecklist.documents.map(item => ({
            ...item,
            uploadedAt: toDate(item?.uploadedAt) || null,
          }))
        : [],
    };
    delete next.closureChecklist.infrastructureApprovedByRafael;
    delete next.closureChecklist.infrastructureApprovedByFernando;
  }
  if (Array.isArray(next.attachments)) {
    next.attachments = next.attachments.map(item => ({
      ...item,
      uploadedAt: toDate(item?.uploadedAt) || null,
    }));
  }
  if (next.guarantee) {
    next.guarantee = {
      ...next.guarantee,
      startAt: toDate(next.guarantee.startAt) || null,
      endAt: toDate(next.guarantee.endAt) || null,
    };
  }
  if (next.executionProgress) {
    const measurementSheetUrlRaw = String(next.executionProgress.measurementSheetUrl || '').trim();
    next.executionProgress = {
      ...next.executionProgress,
      paymentFlowParts: Math.max(1, Number(next.executionProgress.paymentFlowParts || 1)),
      currentPercent: Math.max(0, Number(next.executionProgress.currentPercent || 0)),
      releasedPercent: Math.min(100, Math.max(0, Number(next.executionProgress.releasedPercent || 0))),
      measurementSheetUrl: measurementSheetUrlRaw || null,
      startedAt: toDate(next.executionProgress.startedAt) || null,
      lastUpdatedAt: toDate(next.executionProgress.lastUpdatedAt) || null,
    };
  }
  return stripUndefinedDeep(next);
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
          attachments: Array.isArray(item?.attachments)
            ? item.attachments.map(attachment => ({
                ...attachment,
                uploadedAt: serializeDate(attachment?.uploadedAt),
              }))
            : undefined,
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
    closureChecklist: ticket.closureChecklist
      ? {
          ...ticket.closureChecklist,
          infrastructureApprovalPrimary:
            ticket.closureChecklist.infrastructureApprovalPrimary ??
            ticket.closureChecklist.infrastructureApprovedByRafael ??
            false,
          infrastructureApprovalSecondary:
            ticket.closureChecklist.infrastructureApprovalSecondary ??
            ticket.closureChecklist.infrastructureApprovedByFernando ??
            false,
          requesterApprovedAt: serializeDate(ticket.closureChecklist.requesterApprovedAt),
          serviceStartedAt: serializeDate(ticket.closureChecklist.serviceStartedAt),
          serviceCompletedAt: serializeDate(ticket.closureChecklist.serviceCompletedAt),
          closedAt: serializeDate(ticket.closureChecklist.closedAt),
          documents: Array.isArray(ticket.closureChecklist.documents)
            ? ticket.closureChecklist.documents.map(item => ({
                ...item,
                uploadedAt: serializeDate(item?.uploadedAt),
              }))
            : [],
        }
      : null,
    attachments: Array.isArray(ticket.attachments)
      ? ticket.attachments.map(item => ({
          ...item,
          uploadedAt: serializeDate(item?.uploadedAt),
        }))
      : [],
    guarantee: ticket.guarantee
      ? {
          ...ticket.guarantee,
          startAt: serializeDate(ticket.guarantee.startAt),
          endAt: serializeDate(ticket.guarantee.endAt),
        }
      : null,
    executionProgress: ticket.executionProgress
      ? {
          ...ticket.executionProgress,
          startedAt: serializeDate(ticket.executionProgress.startedAt),
          lastUpdatedAt: serializeDate(ticket.executionProgress.lastUpdatedAt),
        }
      : null,
  };
}

export async function reserveNextTicketId(db) {
  const sequenceRef = db.collection('config').doc('ticketSequence');

  const nextNumber = await db.runTransaction(async transaction => {
    const sequenceSnap = await transaction.get(sequenceRef);
    let current = Number(sequenceSnap.data()?.lastNumber || 0);

    if (!sequenceSnap.exists) {
      const ticketsSnap = await transaction.get(db.collection('tickets'));
      current = ticketsSnap.docs.reduce((max, doc) => Math.max(max, parseTicketSequence(doc.id)), 0);
    }

    const next = current + 1;
    transaction.set(
      sequenceRef,
      {
        lastNumber: next,
        updatedAt: new Date(),
      },
      { merge: true }
    );
    return next;
  });

  return `OS-${String(nextNumber).padStart(4, '0')}`;
}
