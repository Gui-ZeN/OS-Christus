import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
import { generatePasswordResetUrl, normalizeEmail, sendPasswordAccessEmail } from './_lib/passwordAccess.js';

const SUCCESS_MESSAGE = 'Se o e-mail estiver cadastrado, voce recebera instrucoes para redefinir sua senha.';

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
    }

    const body = await readJsonBody(req);
    const email = normalizeEmail(body?.email);
    if (!email || !isValidEmail(email)) {
      return sendJson(res, 400, { ok: false, error: 'Informe um e-mail valido.' });
    }

    const db = getAdminDb();
    const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (userSnap.empty) {
      return sendJson(res, 200, { ok: true, message: SUCCESS_MESSAGE });
    }

    const user = userSnap.docs[0].data() || {};
    if (user.status !== 'Ativo' || user.active === false) {
      return sendJson(res, 200, { ok: true, message: SUCCESS_MESSAGE });
    }

    const resetUrl = await generatePasswordResetUrl(email, req);
    await sendPasswordAccessEmail({
      email,
      name: String(user.name || '').trim(),
      mode: 'forgot',
      resetUrl,
    });

    return sendJson(res, 200, { ok: true, message: SUCCESS_MESSAGE });
  } catch (error) {
    return sendError(res, error, 'Falha ao processar recuperacao de senha.');
  }
}
