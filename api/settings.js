import { requireAdminUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readActorFromHeaders, readJsonBody, sendJson } from './_lib/http.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { DEFAULT_SETTINGS } from './_lib/settingsDefaults.js';

function normalizeEmailTemplate(data, fallback = null) {
  const source = data && typeof data === 'object' ? data : {};
  const fallbackTemplate = fallback && typeof fallback === 'object' ? fallback : {};

  return {
    trigger: String(source.trigger || fallbackTemplate.trigger || '').trim(),
    subject: String(source.subject || fallbackTemplate.subject || '').trim(),
    body: String(source.body || fallbackTemplate.body || '').trim(),
  };
}

function normalizeEmailTemplates(values) {
  const defaults = Object.values(DEFAULT_SETTINGS.emailTemplates.items).map(template => normalizeEmailTemplate(template));
  const byTrigger = new Map(defaults.map(template => [template.trigger, template]));

  for (const value of Array.isArray(values) ? values : []) {
    const trigger = String(value?.trigger || '').trim();
    if (!trigger) continue;
    byTrigger.set(trigger, normalizeEmailTemplate(value, byTrigger.get(trigger)));
  }

  return [...byTrigger.values()].sort((a, b) => a.trigger.localeCompare(b.trigger, 'pt-BR'));
}

function normalizeSla(data) {
  if (Array.isArray(data?.rules)) {
    return {
      ...data,
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

  return DEFAULT_SETTINGS.sla.default;
}

async function ensureDefaults(db) {
  const batch = db.batch();
  const now = new Date();

  for (const value of Object.values(DEFAULT_SETTINGS.emailTemplates.items)) {
    batch.set(
      db.collection('settings').doc('emailTemplates').collection('items').doc(value.trigger),
      { ...value, updatedAt: now, createdAt: now },
      { merge: true }
    );
  }

  batch.set(
    db.collection('settings').doc('dailyDigest').collection('items').doc('default'),
    { ...DEFAULT_SETTINGS.dailyDigest.default, updatedAt: now, createdAt: now },
    { merge: true }
  );
  batch.set(
    db.collection('settings').doc('sla').collection('items').doc('default'),
    { ...DEFAULT_SETTINGS.sla.default, updatedAt: now, createdAt: now },
    { merge: true }
  );

  await batch.commit();
}

async function readSettings(db) {
  const [templatesSnap, digestSnap, slaSnap] = await Promise.all([
    db.collection('settings').doc('emailTemplates').collection('items').get(),
    db.collection('settings').doc('dailyDigest').collection('items').doc('default').get(),
    db.collection('settings').doc('sla').collection('items').doc('default').get(),
  ]);

  const emailTemplates = normalizeEmailTemplates(
    templatesSnap.docs
      .map(doc => doc.data())
      .filter(Boolean)
  );

  return {
    emailTemplate: emailTemplates[0] || null,
    emailTemplates,
    dailyDigest: digestSnap.exists ? digestSnap.data() : null,
    sla: slaSnap.exists ? normalizeSla(slaSnap.data()) : null,
  };
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      await requireAdminUser(req);
      let settings = await readSettings(db);
      if (!settings.emailTemplates?.length || !settings.dailyDigest || !settings.sla) {
        await ensureDefaults(db);
        settings = await readSettings(db);
      }
      return sendJson(res, 200, { ok: true, ...settings });
    }

    if (req.method === 'POST') {
      const admin = await requireAdminUser(req);
      const actor = readActorFromHeaders(req) || admin.email || admin.name || 'painel';
      const body = await readJsonBody(req);
      const section = String(body?.section || '').trim();
      const data = body?.data;

      if (!section || !data) {
        return sendJson(res, 400, { ok: false, error: 'section e data são obrigatórios.' });
      }

      if (!['emailTemplates', 'dailyDigest', 'sla'].includes(section)) {
        return sendJson(res, 400, { ok: false, error: 'section inválida.' });
      }

      const normalizedData =
        section === 'sla'
          ? normalizeSla(data)
          : section === 'emailTemplates'
            ? normalizeEmailTemplate(data)
            : data;
      const docId = section === 'emailTemplates' ? String(normalizedData?.trigger || '').trim() : 'default';

      if (section === 'emailTemplates' && !docId) {
        return sendJson(res, 400, { ok: false, error: 'trigger é obrigatório para templates.' });
      }

      const docRef = db.collection('settings').doc(section).collection('items').doc(docId);
      const beforeSnap = await docRef.get();
      const before = beforeSnap.exists ? beforeSnap.data() : null;

      await docRef.set({ ...normalizedData, updatedAt: new Date() }, { merge: true });

      await writeAuditLog({
        actor,
        action: 'settings.update',
        entity: 'settings',
        entityId: section === 'emailTemplates' ? docId : section,
        before,
        after: normalizedData,
      });

      return sendJson(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha em settings.' });
  }
}
