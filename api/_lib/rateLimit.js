import { createHash } from 'node:crypto';
import { getAdminDb } from './firebaseAdmin.js';
import { HttpError } from './http.js';

// Resolve o IP do cliente atrás do proxy da Vercel.
export function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return (
    forwarded ||
    String(req.headers['x-real-ip'] || '').trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Limiter de janela fixa, persistido no Firestore (coleção `rateLimits`), para
 * uso em endpoints públicos sem autenticação. O IP é armazenado com hash para
 * não persistir dado pessoal em claro.
 *
 * @param {object} req  Requisição.
 * @param {object} opts { bucket, limit, windowMs, message? }
 * @throws {HttpError} 429 quando o limite da janela é excedido.
 */
export async function enforceRateLimit(req, { bucket, limit, windowMs, message }) {
  const db = getAdminDb();
  const ip = getClientIp(req);
  const ipHash = createHash('sha256').update(`${bucket}:${ip}`).digest('hex').slice(0, 40);
  const ref = db.collection('rateLimits').doc(`${bucket}__${ipHash}`);
  const now = Date.now();
  const limitMessage = message || 'Muitas requisições em pouco tempo. Tente novamente em instantes.';

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    // Janela expirada (ou inexistente): reinicia a contagem.
    if (!data || now - Number(data.windowStart || 0) >= windowMs) {
      tx.set(ref, { windowStart: now, count: 1, updatedAt: new Date() });
      return;
    }

    if (Number(data.count || 0) >= limit) {
      throw new HttpError(429, limitMessage);
    }

    tx.set(
      ref,
      { count: Number(data.count || 0) + 1, windowStart: data.windowStart, updatedAt: new Date() },
      { merge: true }
    );
  });
}
