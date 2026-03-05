import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendJson } from './_lib/http.js';
import { DEFAULT_REGIONS, DEFAULT_SITES } from './_lib/catalogDefaults.js';

async function readCatalog(db) {
  const [regionsSnap, sitesSnap] = await Promise.all([
    db.collection('regions').where('active', '==', true).get(),
    db.collection('sites').where('active', '==', true).get(),
  ]);

  const regions = regionsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  const sites = sitesSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));

  return { regions, sites };
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

  await batch.commit();
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      let { regions, sites } = await readCatalog(db);
      if (regions.length === 0 || sites.length === 0) {
        await seedDefaults(db);
        ({ regions, sites } = await readCatalog(db));
      }
      return sendJson(res, 200, { ok: true, regions, sites });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body?.seedDefaults !== true) {
        return sendJson(res, 400, { ok: false, error: 'Envie { seedDefaults: true } para popular o catálogo.' });
      }
      await seedDefaults(db);
      const { regions, sites } = await readCatalog(db);
      return sendJson(res, 200, { ok: true, seeded: true, regions, sites });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no catálogo.' });
  }
}
