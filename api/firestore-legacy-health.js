import { getAdminDb } from './_lib/firebaseAdmin.js';
import { sendJson } from './_lib/http.js';

const LEGACY_ROLE_MAP = {
  'Gestor de OS': 'Supervisor',
  Financeiro: 'Admin',
  'Aprovador Contratos': 'Supervisor',
  'Tecnico (Interno)': 'Usuario',
  Terceirizado: 'Usuario',
};

function isTimestampLike(value) {
  return value instanceof Date || typeof value?.toDate === 'function' || typeof value?._seconds === 'number' || typeof value?.seconds === 'number';
}

function hasLegacySlaShape(data) {
  return Boolean(data && (data.urgentHours || data.highHours || data.normalHours || data.lowHours));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
    }

    const db = getAdminDb();
    const [usersSnap, ticketsSnap, notificationsSnap, slaSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('tickets').get(),
      db.collection('notifications').get(),
      db.collection('settings').doc('sla').collection('items').doc('default').get(),
    ]);

    const legacyUsers = usersSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(user => Boolean(LEGACY_ROLE_MAP[user.role]));

    const ticketsMissingCatalog = ticketsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(ticket => !ticket.regionId || !ticket.siteId);

    const notificationsLegacy = notificationsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => !isTimestampLike(item.time));

    const sla = slaSnap.exists ? slaSnap.data() : null;
    const slaLegacy = hasLegacySlaShape(sla);
    const slaMissingRules = !Array.isArray(sla?.rules);

    return sendJson(res, 200, {
      ok: true,
      summary: {
        legacyUsers: legacyUsers.length,
        ticketsMissingCatalog: ticketsMissingCatalog.length,
        notificationsLegacy: notificationsLegacy.length,
        slaLegacy: slaLegacy || slaMissingRules ? 1 : 0,
      },
      samples: {
        legacyUsers: legacyUsers.slice(0, 10).map(user => ({ id: user.id, email: user.email, role: user.role })),
        ticketsMissingCatalog: ticketsMissingCatalog.slice(0, 10).map(ticket => ({
          id: ticket.id,
          region: ticket.region || null,
          regionId: ticket.regionId || null,
          sede: ticket.sede || null,
          siteId: ticket.siteId || null,
        })),
        notificationsLegacy: notificationsLegacy.slice(0, 10).map(item => ({
          id: item.id,
          time: item.time || null,
        })),
        sla: sla
          ? {
              hasRules: Array.isArray(sla.rules),
              hasLegacyHours: slaLegacy,
            }
          : null,
      },
    });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao analisar legado do Firestore.' });
  }
}
