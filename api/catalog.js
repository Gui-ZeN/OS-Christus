import { requireAdminUser } from './_lib/authz.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readActorFromHeaders, readJsonBody, sendJson } from './_lib/http.js';
import {
  DEFAULT_MACRO_SERVICES,
  DEFAULT_MATERIALS,
  DEFAULT_REGIONS,
  DEFAULT_SERVICE_CATALOG,
  DEFAULT_SITES,
} from './_lib/catalogDefaults.js';

const ENTITY_COLLECTION_MAP = {
  regions: 'regions',
  sites: 'sites',
  macroServices: 'macroServices',
  serviceCatalog: 'serviceCatalog',
  materials: 'materials',
};

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function readCatalog(db) {
  const [regionsSnap, sitesSnap, macroServicesSnap, serviceCatalogSnap, materialsSnap, vendorPreferenceEventsSnap] = await Promise.all([
    db.collection('regions').where('active', '==', true).get(),
    db.collection('sites').where('active', '==', true).get(),
    db.collection('macroServices').where('active', '==', true).get(),
    db.collection('serviceCatalog').where('active', '==', true).get(),
    db.collection('materials').where('active', '==', true).get(),
    db.collection('vendorPreferenceEvents').get(),
  ]);

  const regions = regionsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const sites = sitesSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const macroServices = macroServicesSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const serviceCatalog = serviceCatalogSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const materials = materialsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  const vendorPreferenceMap = new Map();

  vendorPreferenceEventsSnap.docs.forEach(doc => {
    const data = { id: doc.id, ...doc.data() };
    const approvedAtRaw = data.approvedAt?.toDate ? data.approvedAt.toDate() : data.approvedAt ? new Date(data.approvedAt) : null;
    if (approvedAtRaw && !Number.isNaN(approvedAtRaw.getTime()) && approvedAtRaw < cutoff) {
      return;
    }

    const scopeType = String(data.scopeType || '').trim();
    const scopeId = String(data.scopeId || '').trim();
    const vendor = String(data.vendor || '').trim();
    if (!scopeType || !scopeId || !vendor) return;

    const key = `${scopeType}:${scopeId}:${vendor.toLowerCase()}`;
    const current = vendorPreferenceMap.get(key) || {
      id: key.replace(/[^a-z0-9:-]+/gi, '-'),
      scopeType,
      scopeId,
      scopeName: data.scopeName || scopeId,
      vendor,
      approvalCount: 0,
      totalApprovedValue: 0,
      approvedValueSamples: 0,
      totalUnitPrice: 0,
      unitPriceSamples: 0,
      lastApprovedAt: null,
      lastApprovedValue: null,
      lastTicketId: null,
      unit: data.unit || null,
      materialId: data.materialId || null,
      materialName: data.materialName || null,
      serviceCatalogId: data.serviceCatalogId || null,
      serviceCatalogName: data.serviceCatalogName || null,
      macroServiceId: data.macroServiceId || null,
      macroServiceName: data.macroServiceName || null,
    };

    current.approvalCount += 1;
    if (typeof data.approvedValue === 'number' && Number.isFinite(data.approvedValue)) {
      current.totalApprovedValue += data.approvedValue;
      current.approvedValueSamples += 1;
    }
    if (typeof data.unitPrice === 'number' && Number.isFinite(data.unitPrice)) {
      current.totalUnitPrice += data.unitPrice;
      current.unitPriceSamples += 1;
    }
    if (!current.lastApprovedAt || (approvedAtRaw && approvedAtRaw > current.lastApprovedAt)) {
      current.lastApprovedAt = approvedAtRaw;
      current.lastApprovedValue = typeof data.approvedValue === 'number' ? data.approvedValue : null;
      current.lastTicketId = data.ticketId || null;
    }

    vendorPreferenceMap.set(key, current);
  });

  const vendorPreferences = [...vendorPreferenceMap.values()]
    .map(item => ({
      id: item.id,
      scopeType: item.scopeType,
      scopeId: item.scopeId,
      scopeName: item.scopeName,
      vendor: item.vendor,
      approvalCount: item.approvalCount,
      averageApprovedValue:
        item.approvedValueSamples > 0 ? item.totalApprovedValue / item.approvedValueSamples : null,
      averageUnitPrice: item.unitPriceSamples > 0 ? item.totalUnitPrice / item.unitPriceSamples : null,
      lastApprovedAt: item.lastApprovedAt,
      lastApprovedValue: item.lastApprovedValue,
      lastTicketId: item.lastTicketId,
      unit: item.unit,
      materialId: item.materialId,
      materialName: item.materialName,
      serviceCatalogId: item.serviceCatalogId,
      serviceCatalogName: item.serviceCatalogName,
      macroServiceId: item.macroServiceId,
      macroServiceName: item.macroServiceName,
    }))
    .sort((a, b) => {
      if (b.approvalCount !== a.approvalCount) return b.approvalCount - a.approvalCount;
      return String(a.vendor).localeCompare(String(b.vendor), 'pt-BR');
    });

  return { regions, sites, macroServices, serviceCatalog, materials, vendorPreferences };
}

async function seedDefaults(db) {
  const batch = db.batch();
  const now = new Date();

  for (const region of DEFAULT_REGIONS) {
    const ref = db.collection('regions').doc(region.id);
    batch.set(ref, { ...region, updatedAt: now, createdAt: now }, { merge: true });
  }

  for (const site of DEFAULT_SITES) {
    const ref = db.collection('sites').doc(site.id);
    batch.set(ref, { ...site, updatedAt: now, createdAt: now }, { merge: true });
  }

  for (const macroService of DEFAULT_MACRO_SERVICES) {
    const ref = db.collection('macroServices').doc(macroService.id);
    batch.set(ref, { ...macroService, updatedAt: now, createdAt: now }, { merge: true });
  }

  for (const service of DEFAULT_SERVICE_CATALOG) {
    const ref = db.collection('serviceCatalog').doc(service.id);
    batch.set(ref, { ...service, updatedAt: now, createdAt: now }, { merge: true });
  }

  for (const material of DEFAULT_MATERIALS) {
    const ref = db.collection('materials').doc(material.id);
    batch.set(ref, { ...material, updatedAt: now, createdAt: now }, { merge: true });
  }

  await batch.commit();
}

function normalizeCatalogRecord(entity, record) {
  const name = String(record?.name || '').trim();
  const code = String(record?.code || '').trim();
  const id = String(record?.id || '').trim() || slugify(code || name);

  if (!name) {
    throw new Error('name e obrigatorio.');
  }
  if (!id) {
    throw new Error('Não foi possível gerar id para o registro.');
  }

  const base = {
    id,
    code,
    name,
    active: record?.active !== false,
  };

  if (entity === 'macroServices') {
    return base;
  }

  if (entity === 'materials') {
    return {
      ...base,
      unit: String(record?.unit || '').trim() || null,
    };
  }

  if (entity === 'serviceCatalog') {
    const macroServiceId = String(record?.macroServiceId || '').trim();
    if (!macroServiceId) {
      throw new Error('macroServiceId e obrigatorio para serviceCatalog.');
    }
    return {
      ...base,
      macroServiceId,
      suggestedMaterialIds: Array.isArray(record?.suggestedMaterialIds)
        ? record.suggestedMaterialIds.map(value => String(value || '').trim()).filter(Boolean)
        : [],
    };
  }

  if (entity === 'regions') {
    return {
      ...base,
      group: String(record?.group || '').trim() || 'operacao',
    };
  }

  if (entity === 'sites') {
    const regionId = String(record?.regionId || '').trim();
    if (!regionId) {
      throw new Error('regionId e obrigatorio para sites.');
    }
    return {
      ...base,
      regionId,
    };
  }

  throw new Error('Entidade de catalogo invalida.');
}

async function upsertCatalogEntry(db, entity, record) {
  const collection = ENTITY_COLLECTION_MAP[entity];
  if (!collection) {
    throw new Error('Entidade de catalogo invalida.');
  }

  const normalized = normalizeCatalogRecord(entity, record);
  const ref = db.collection(collection).doc(normalized.id);
  const snapshot = await ref.get();
  const now = new Date();

  await ref.set(
    {
      ...normalized,
      updatedAt: now,
      createdAt: snapshot.exists ? snapshot.data()?.createdAt || now : now,
    },
    { merge: true }
  );

  return {
    before: snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null,
    after: normalized,
  };
}

async function assertCatalogEntryCanDelete(db, entity, id) {
  if (entity === 'regions') {
    const [sitesSnap, usersSnap, ticketsSnap] = await Promise.all([
      db.collection('sites').where('regionId', '==', id).limit(1).get(),
      db.collection('users').where('regionIds', 'array-contains', id).limit(1).get(),
      db.collection('tickets').where('regionId', '==', id).limit(1).get(),
    ]);

    if (!sitesSnap.empty) throw new Error('Não é possível excluir a região enquanto existirem sedes vinculadas.');
    if (!usersSnap.empty) throw new Error('Não é possível excluir a região enquanto houver usuários vinculados.');
    if (!ticketsSnap.empty) throw new Error('Não é possível excluir a região porque ela já está vinculada a tickets.');
    return;
  }

  if (entity === 'sites') {
    const [usersSnap, ticketsSnap] = await Promise.all([
      db.collection('users').where('siteIds', 'array-contains', id).limit(1).get(),
      db.collection('tickets').where('siteId', '==', id).limit(1).get(),
    ]);

    if (!usersSnap.empty) throw new Error('Não é possível excluir a sede enquanto houver usuários vinculados.');
    if (!ticketsSnap.empty) throw new Error('Não é possível excluir a sede porque ela já está vinculada a tickets.');
  }
}

async function deleteCatalogEntry(db, entity, id) {
  const collection = ENTITY_COLLECTION_MAP[entity];
  if (!collection) {
    throw new Error('Entidade de catalogo invalida.');
  }

  const ref = db.collection(collection).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new Error('Registro do catalogo nao encontrado.');
  }

  await assertCatalogEntryCanDelete(db, entity, id);
  const before = { id: snapshot.id, ...snapshot.data() };
  await ref.delete();
  return before;
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      let catalog = await readCatalog(db);
      if (
        catalog.regions.length === 0 ||
        catalog.sites.length === 0 ||
        catalog.macroServices.length === 0 ||
        catalog.serviceCatalog.length === 0 ||
        catalog.materials.length === 0
      ) {
        await seedDefaults(db);
        catalog = await readCatalog(db);
      }
      return sendJson(res, 200, { ok: true, ...catalog });
    }

    if (req.method === 'POST') {
      const adminUser = await requireAdminUser(req);
      const actor = readActorFromHeaders(req) || adminUser.email || adminUser.name || 'admin';
      const body = await readJsonBody(req);

      if (body?.seedDefaults === true) {
        await seedDefaults(db);
        await writeAuditLog({
          actor,
          action: 'catalog.seedDefaults',
          entity: 'catalog',
          entityId: 'defaults',
          after: { seeded: true },
        });
        const catalog = await readCatalog(db);
        return sendJson(res, 200, { ok: true, seeded: true, ...catalog });
      }

      const entity = String(body?.entity || '').trim();
      const { before, after } = await upsertCatalogEntry(db, entity, body?.record || {});
      await writeAuditLog({
        actor,
        action: 'catalog.upsert',
        entity: entity || 'catalog',
        entityId: after.id,
        before,
        after,
      });
      const catalog = await readCatalog(db);
      return sendJson(res, 200, { ok: true, entity, record: after, ...catalog });
    }

    if (req.method === 'DELETE') {
      const adminUser = await requireAdminUser(req);
      const actor = readActorFromHeaders(req) || adminUser.email || adminUser.name || 'admin';
      const body = await readJsonBody(req);
      const entity = String(body?.entity || '').trim();
      const id = String(body?.id || '').trim();
      if (!entity || !id) {
        return sendJson(res, 400, { ok: false, error: 'entity e id sao obrigatorios.' });
      }

      const before = await deleteCatalogEntry(db, entity, id);
      await writeAuditLog({
        actor,
        action: 'catalog.delete',
        entity,
        entityId: id,
        before,
        after: null,
      });
      const catalog = await readCatalog(db);
      return sendJson(res, 200, { ok: true, entity, id, ...catalog });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no catalogo.' });
  }
}
