import { toDateOrNull } from './_lib/dates.js';
import { requireAuthenticatedUser , resolveActor } from './_lib/authz.js';
import { canUserAccessTicket, readTerritoryCatalog } from './_lib/ticketAccess.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { HttpError, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { FieldPath } from 'firebase-admin/firestore';
import {
  canUserSeeNotification,
  getNotificationStateCollection,
  isNotificationDismissed,
  mergeNotificationState,
  notificationTtlAt,
  resolveNotificationTicketId,
} from './_lib/notificationState.js';

// Escopo territorial de uma notificação ligada a uma OS. Admin vê tudo;
// notificação sem ticketId é geral. Demais perfis só veem se a OS referenciada
// estiver no seu escopo (região/sede).
async function canUserAccessNotificationTicket(db, user, notification, territory) {
  if (user?.role === 'Admin') return true;
  const ticketId = resolveNotificationTicketId(notification);
  if (!ticketId) return true;
  const ticketSnap = await db.collection('tickets').doc(ticketId).get();
  if (!ticketSnap.exists) return false;
  const cat = territory || (await readTerritoryCatalog(db));
  return canUserAccessTicket(user, { id: ticketSnap.id, ...ticketSnap.data() }, cat.regions, cat.sites);
}

function normalizePageLimit(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 100);
}

function encodeCursor(notificationDoc) {
  const createdAt = toDateOrNull(notificationDoc?.data()?.createdAt);
  if (!createdAt || !notificationDoc?.id) return null;
  return Buffer.from(JSON.stringify({
    createdAt: createdAt.toISOString(),
    id: notificationDoc.id,
  })).toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const createdAt = new Date(parsed?.createdAt);
    const id = String(parsed?.id || '').trim();
    if (Number.isNaN(createdAt.getTime()) || !id) throw new Error('invalid cursor');
    return { createdAt, id };
  } catch {
    throw new HttpError(400, 'Cursor de notificações inválido.');
  }
}

// Teto de rodadas de leitura por página. Sem ele, um usuário de escopo estreito
// varreria a coleção inteira atrás de itens visíveis.
const MAX_NOTIFICATION_SCAN_ROUNDS = 5;
// Lê mais que o necessário por rodada: com filtro apertado, ler exatamente
// `limit` garantiria outra ida ao banco.
const NOTIFICATION_SCAN_OVERSHOOT = 3;

/**
 * Aplica o que ESCONDE uma notificação: audiência do papel, dispensa por usuário
 * e escopo territorial da OS referenciada. Devolve o par {notification, doc}
 * porque o cursor da próxima página precisa do documento BRUTO que originou o
 * último item entregue.
 */
async function filterVisibleNotifications(db, user, docs, territory) {
  if (docs.length === 0) return [];
  const stateCollection = getNotificationStateCollection(db, user.id);
  const stateSnaps = await db.getAll(...docs.map(doc => stateCollection.doc(doc.id)));
  const stateByNotificationId = new Map(
    stateSnaps.filter(doc => doc.exists).map(doc => [doc.id, doc.data()])
  );

  const visibleByRole = docs
    .map(doc => ({
      doc,
      notification: mergeNotificationState(
        { id: doc.id, ...doc.data() },
        stateByNotificationId.get(doc.id)
      ),
    }))
    .filter(item => canUserSeeNotification(user, item.notification))
    .filter(item => !isNotificationDismissed(stateByNotificationId.get(item.notification.id)));

  if (user?.role === 'Admin') return visibleByRole;

  // Escopo territorial em lote: busca todos os tickets referenciados de uma vez
  // (db.getAll) em vez de uma leitura por notificação (antes era O(N) em série).
  const ticketIds = [
    ...new Set(visibleByRole.map(item => resolveNotificationTicketId(item.notification)).filter(Boolean)),
  ];
  const ticketMap = new Map();
  if (ticketIds.length > 0) {
    const snaps = await db.getAll(...ticketIds.map(id => db.collection('tickets').doc(id)));
    for (const ticketSnap of snaps) {
      if (ticketSnap.exists) ticketMap.set(ticketSnap.id, { id: ticketSnap.id, ...ticketSnap.data() });
    }
  }

  return visibleByRole.filter(item => {
    const ticketId = resolveNotificationTicketId(item.notification);
    if (!ticketId) return true; // notificação geral
    const ticket = ticketMap.get(ticketId);
    if (!ticket) return false; // OS inexistente → fail-closed
    return canUserAccessTicket(user, ticket, territory.regions, territory.sites);
  });
}

/**
 * O `limit` era aplicado na QUERY e o filtro de audiência/território só depois:
 * um usuário de escopo estreito recebia página vazia (e parava de paginar) mesmo
 * havendo notificações acessíveis mais adiante. Agora o scan continua até juntar
 * `limit` itens visíveis ou esgotar a coleção/o teto de rodadas.
 */
async function readNotifications(db, user, options = {}) {
  const limit = normalizePageLimit(options.limit);
  let cursor = decodeCursor(options.cursor);
  const territory = user?.role === 'Admin' ? null : await readTerritoryCatalog(db);

  const collected = [];
  let exhausted = false;
  let lastScannedDoc = null;

  for (let round = 0; round < MAX_NOTIFICATION_SCAN_ROUNDS && collected.length < limit; round += 1) {
    const batchSize = Math.max(limit - collected.length, 1) * NOTIFICATION_SCAN_OVERSHOOT;
    let query = db.collection('notifications')
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(batchSize);
    if (cursor) query = query.startAfter(cursor.createdAt, cursor.id);

    const snap = await query.get();
    if (snap.empty) {
      exhausted = true;
      break;
    }
    if (snap.docs.length < batchSize) exhausted = true;

    collected.push(...(await filterVisibleNotifications(db, user, snap.docs, territory)));

    lastScannedDoc = snap.docs.at(-1);
    cursor = { createdAt: toDateOrNull(lastScannedDoc.data()?.createdAt), id: lastScannedDoc.id };
    if (exhausted) break;
  }

  const page = collected.slice(0, limit);
  const hasMore = collected.length > limit || !exhausted;
  // O cursor sai do doc BRUTO do último item ENTREGUE — usar o último escaneado
  // pularia os visíveis que ficaram fora do corte. Quando a página sai vazia mas
  // ainda há documento à frente (teto de rodadas atingido), o cursor volta a ser
  // o último escaneado: sem isso o cliente receberia null e PARARIA de paginar,
  // que é justamente o defeito sendo corrigido.
  const cursorDoc = page.length > 0 ? page.at(-1).doc : lastScannedDoc;
  return {
    notifications: page.map(item => item.notification),
    nextCursor: hasMore && cursorDoc ? encodeCursor(cursorDoc) : null,
  };
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const user = await requireAuthenticatedUser(req);
      const page = await readNotifications(db, user, {
        cursor: req.query?.cursor,
        limit: req.query?.limit,
      });
      return sendJson(res, 200, { ok: true, ...page });
    }

    if (req.method === 'POST') {
      const user = await requireAuthenticatedUser(req);
      const actor = resolveActor(user);
      const body = await readJsonBody(req);
      const action = String(body?.action || '').trim();

      if (action === 'markRead') {
        const id = String(body?.id || '').trim();
        if (!id) return sendJson(res, 400, { ok: false, error: 'id obrigatório.' });
        const ref = db.collection('notifications').doc(id);
        const snap = await ref.get();
        if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Notificação não encontrada.' });
        if (!canUserSeeNotification(user, snap.data()) || !(await canUserAccessNotificationTicket(db, user, snap.data()))) {
          return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente.' });
        }
        const now = new Date();
        await getNotificationStateCollection(db, user.id).doc(id).set(
          {
            notificationId: id,
            userId: user.id,
            readAt: now,
            updatedAt: now,
            // Mesmo TTL da notificação: sem isto o doc de estado sobrevive ao
            // que ele descreve e o lixo por usuário cresce sem fim.
            ttlAt: notificationTtlAt(now),
          },
          { merge: true }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'dismiss') {
        const id = String(body?.id || '').trim();
        if (!id) return sendJson(res, 400, { ok: false, error: 'id obrigatório.' });
        const ref = db.collection('notifications').doc(id);
        const snap = await ref.get();
        if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Notificação não encontrada.' });
        const notificationData = snap.data();
        if (!canUserSeeNotification(user, notificationData) || !(await canUserAccessNotificationTicket(db, user, notificationData))) {
          return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente.' });
        }
        const now = new Date();
        await getNotificationStateCollection(db, user.id).doc(id).set(
          {
            notificationId: id,
            userId: user.id,
            dismissedAt: now,
            updatedAt: now,
            ttlAt: notificationTtlAt(now),
          },
          { merge: true }
        );
        await writeAuditLog({
          actor,
          action: 'notifications.dismiss',
          entity: 'notification',
          entityId: id,
          metadata: { userId: user.id },
        });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'markAllRead') {
        // Percorre todas as páginas visíveis; a leitura comum continua limitada.
        const now = new Date();
        const stateCollection = getNotificationStateCollection(db, user.id);
        let cursor = null;
        do {
          const page = await readNotifications(db, user, { cursor, limit: 100 });
          const batch = db.batch();
          for (const item of page.notifications) {
            batch.set(
              stateCollection.doc(item.id),
              {
                notificationId: item.id,
                userId: user.id,
                readAt: now,
                updatedAt: now,
                ttlAt: notificationTtlAt(now),
              },
              { merge: true }
            );
          }
          if (page.notifications.length > 0) await batch.commit();
          cursor = page.nextCursor;
        } while (cursor);
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 400, { ok: false, error: 'Ação inválida.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendError(res, error, 'Falha nas notificações.');
  }
}
