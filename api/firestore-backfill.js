import { requireAdminUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { runFirestoreLegacyBackfill } from './_lib/firestoreBackfill.js';
import { sendJson } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const admin = await requireAdminUser(req);
    const db = getAdminDb();
    const result = await runFirestoreLegacyBackfill(db, admin.email || admin.name || 'admin');

    return sendJson(res, 200, {
      ok: true,
      actor: {
        email: admin.email,
        name: admin.name,
      },
      result,
    });
  } catch (error) {
    const message = error.message || 'Falha ao executar backfill.';
    const statusCode =
      message.includes('Token') || message.includes('autentic') || message.includes('Permissão') || message.includes('inativo')
        ? 401
        : 400;
    return sendJson(res, statusCode, { ok: false, error: message });
  }
}
