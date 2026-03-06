import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readActorFromHeaders, readJsonBody, sendJson } from './_lib/http.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { DEFAULT_SETTINGS } from './_lib/settingsDefaults.js';

async function ensureDefaults(db) {
  const batch = db.batch();
  const now = new Date();
  const entries = [
    ['emailTemplates', 'default', DEFAULT_SETTINGS.emailTemplates.default],
    ['dailyDigest', 'default', DEFAULT_SETTINGS.dailyDigest.default],
    ['sla', 'default', DEFAULT_SETTINGS.sla.default],
  ];

  for (const [collectionName, docId, value] of entries) {
    batch.set(
      db.collection('settings').doc(collectionName).collection('items').doc(docId),
      { ...value, updatedAt: now, createdAt: now },
      { merge: true }
    );
  }

  await batch.commit();
}

async function readSettings(db) {
  const refs = await Promise.all([
    db.collection('settings').doc('emailTemplates').collection('items').doc('default').get(),
    db.collection('settings').doc('dailyDigest').collection('items').doc('default').get(),
    db.collection('settings').doc('sla').collection('items').doc('default').get(),
  ]);

  return {
    emailTemplate: refs[0].exists ? refs[0].data() : null,
    dailyDigest: refs[1].exists ? refs[1].data() : null,
    sla: refs[2].exists ? refs[2].data() : null,
  };
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      let settings = await readSettings(db);
      if (!settings.emailTemplate || !settings.dailyDigest || !settings.sla) {
        await ensureDefaults(db);
        settings = await readSettings(db);
      }
      return sendJson(res, 200, { ok: true, ...settings });
    }

    if (req.method === 'POST') {
      const actor = readActorFromHeaders(req);
      const body = await readJsonBody(req);
      const section = String(body?.section || '').trim();
      const data = body?.data;
      if (!section || !data) {
        return sendJson(res, 400, { ok: false, error: 'section e data sao obrigatorios.' });
      }

      const allowed = ['emailTemplates', 'dailyDigest', 'sla'];
      if (!allowed.includes(section)) {
        return sendJson(res, 400, { ok: false, error: 'section invalida.' });
      }

      const docRef = db.collection('settings').doc(section).collection('items').doc('default');
      const beforeSnap = await docRef.get();
      const before = beforeSnap.exists ? beforeSnap.data() : null;
      await docRef.set({ ...data, updatedAt: new Date() }, { merge: true });

      await writeAuditLog({
        actor,
        action: 'settings.update',
        entity: 'settings',
        entityId: section,
        before,
        after: data,
      });

      return sendJson(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha em settings.' });
  }
}
