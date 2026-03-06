import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { writeAuditLog } from './auditLogs.js';

const LEGACY_ROLE_MAP = {
  'Gestor de OS': 'Supervisor',
  Financeiro: 'Admin',
  'Aprovador Contratos': 'Supervisor',
  'Tecnico (Interno)': 'Usuario',
  Terceirizado: 'Usuario',
};

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'object' && value !== null) {
    const seconds = typeof value._seconds === 'number' ? value._seconds : value.seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeSla(data) {
  if (Array.isArray(data?.rules)) {
    return {
      rules: data.rules.map(rule => ({
        priority: String(rule?.priority || '').trim(),
        prazo: String(rule?.prazo || '').trim(),
      })),
    };
  }

  if (data && typeof data === 'object') {
    return {
      rules: [
        { priority: 'Urgente', prazo: `${Number(data.urgentHours || 24)}h` },
        { priority: 'Alta', prazo: `${Number(data.highHours || 72)}h` },
        { priority: 'Normal', prazo: `${Number(data.normalHours || 120)}h` },
        { priority: 'Trivial', prazo: `${Number(data.lowHours || 240)}h` },
      ],
    };
  }

  return {
    rules: [
      { priority: 'Urgente', prazo: '24h' },
      { priority: 'Alta', prazo: '72h' },
      { priority: 'Normal', prazo: '120h' },
      { priority: 'Trivial', prazo: '240h' },
    ],
  };
}

function resolveSiteId(ticket, sites) {
  const raw = [ticket.siteId, ticket.sede].map(normalizeKey).filter(Boolean);
  const site = sites.find(entry =>
    raw.some(value => [entry.id, entry.code, entry.name].map(normalizeKey).includes(value))
  );
  return site?.id || null;
}

function resolveRegionId(ticket, regions, sites) {
  const raw = [ticket.regionId, ticket.region].map(normalizeKey).filter(Boolean);
  const directMatch = regions.find(region =>
    raw.some(value => [region.id, region.code, region.name].map(normalizeKey).includes(value))
  );
  if (directMatch) return directMatch.id;

  const siteId = resolveSiteId(ticket, sites);
  if (!siteId) return null;
  return sites.find(site => site.id === siteId)?.regionId || null;
}

export async function runFirestoreLegacyBackfill(db, actor = 'sistema') {
  const [regionsSnap, sitesSnap, usersSnap, ticketsSnap, notificationsSnap, slaSnap] = await Promise.all([
    db.collection('regions').get(),
    db.collection('sites').get(),
    db.collection('users').get(),
    db.collection('tickets').get(),
    db.collection('notifications').get(),
    db.collection('settings').doc('sla').collection('items').doc('default').get(),
  ]);

  const regions = regionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const sites = sitesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  let updatedUsers = 0;
  let updatedTickets = 0;
  let updatedNotifications = 0;
  let updatedSla = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const nextRole = LEGACY_ROLE_MAP[data.role] || data.role;
    const nextRegionIds = Array.isArray(data.regionIds) ? data.regionIds.map(value => String(value || '').trim()).filter(Boolean) : [];
    const nextSiteIds = Array.isArray(data.siteIds) ? data.siteIds.map(value => String(value || '').trim()).filter(Boolean) : [];

    const changed =
      nextRole !== data.role ||
      JSON.stringify(nextRegionIds) !== JSON.stringify(data.regionIds || []) ||
      JSON.stringify(nextSiteIds) !== JSON.stringify(data.siteIds || []);

    if (!changed) continue;

    await doc.ref.set(
      {
        role: nextRole,
        regionIds: nextRegionIds,
        siteIds: nextSiteIds,
        updatedAt: new Date(),
      },
      { merge: true }
    );
    updatedUsers += 1;
  }

  for (const doc of ticketsSnap.docs) {
    const data = doc.data();
    const siteId = resolveSiteId(data, sites);
    const regionId = resolveRegionId(data, regions, sites);
    const patch = {};

    if (siteId && data.siteId !== siteId) patch.siteId = siteId;
    if (regionId && data.regionId !== regionId) patch.regionId = regionId;

    if (Object.keys(patch).length === 0) continue;

    await doc.ref.set({ ...patch, updatedAt: new Date() }, { merge: true });
    updatedTickets += 1;
  }

  for (const doc of notificationsSnap.docs) {
    const data = doc.data();
    const time = toDate(data.time) || toDate(data.createdAt);
    if (!time) continue;

    const changed = !(data.time instanceof Timestamp) && !(data.time?.toDate instanceof Function);
    if (!changed) continue;

    await doc.ref.set({ time, updatedAt: new Date() }, { merge: true });
    updatedNotifications += 1;
  }

  if (slaSnap.exists) {
    const data = slaSnap.data();
    if (!Array.isArray(data?.rules)) {
      await slaSnap.ref.set(
        {
          ...normalizeSla(data),
          migratedAt: FieldValue.serverTimestamp(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
      updatedSla += 1;
    }
  }

  const result = {
    updatedUsers,
    updatedTickets,
    updatedNotifications,
    updatedSla,
  };

  await writeAuditLog({
    actor,
    action: 'firestore.backfill_legacy',
    entity: 'firestore',
    entityId: 'legacy',
    before: null,
    after: result,
    metadata: {
      executedAt: new Date().toISOString(),
    },
  });

  return result;
}
