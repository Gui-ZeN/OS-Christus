import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
import { generatePasswordResetUrl, normalizeEmail, sendPasswordAccessEmail } from './_lib/passwordAccess.js';
import { enforceRateLimit } from './_lib/rateLimit.js';

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

    // Limita tentativas por IP (anti email-bombing / enumeração).
    await enforceRateLimit(req, {
      bucket: 'password-reset',
      limit: 5,
      windowMs: 15 * 60 * 1000,
      message: 'Muitas tentativas de recuperação. Aguarde alguns minutos e tente novamente.',
    });

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

    // Falhas no envio não devem revelar a existência da conta nem retornar 500:
    // a resposta é sempre o mesmo SUCCESS_MESSAGE.
    try {
      const resetUrl = await generatePasswordResetUrl(email, req);
      await sendPasswordAccessEmail({
        email,
        name: String(user.name || '').trim(),
        mode: 'forgot',
        resetUrl,
      });
    } catch (mailError) {
      console.error('Falha ao enviar e-mail de recuperação:', mailError);
    }

    return sendJson(res, 200, { ok: true, message: SUCCESS_MESSAGE });
  } catch (error) {
    return sendError(res, error, 'Falha ao processar recuperacao de senha.');
  }
}
