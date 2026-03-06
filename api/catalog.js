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
  const [regionsSnap, sitesSnap, macroServicesSnap, serviceCatalogSnap, materialsSnap] = await Promise.all([
    db.collection('regions').where('active', '==', true).get(),
    db.collection('sites').where('active', '==', true).get(),
    db.collection('macroServices').where('active', '==', true).get(),
    db.collection('serviceCatalog').where('active', '==', true).get(),
    db.collection('materials').where('active', '==', true).get(),
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

  return { regions, sites, macroServices, serviceCatalog, materials };
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
    throw new Error('Nao foi possivel gerar id para o registro.');
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

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no catalogo.' });
  }
}
