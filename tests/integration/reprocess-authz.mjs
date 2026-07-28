import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Regressão do P2 "reprocessamento inbound aberto demais" (4ª auditoria).
 *
 * `POST /api/mail?route=reprocess-inbound` aceitava Admin, Gestor E Diretor.
 * A operação reescreve sede, thread e histórico de VÁRIOS tickets numa janela de
 * até 60 dias — é administrativa, e contrariava a segregação de papéis adotada
 * no resto do sistema. Agora é só Admin, e fica registrada em auditLogs.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(email) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test@123456', returnSecureToken: true }),
    }
  );
  const json = await res.json();
  if (!json.idToken) throw new Error(`sem idToken para ${email}: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function reprocess(token, days = 1) {
  const res = await fetch(`${API}/api/mail?route=reprocess-inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ days }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  // Papéis que NÃO podem mais disparar, testados um a um.
  for (const [papel, email] of [
    ['Gestor', 'gestor.e2e@test.local'],
    ['Diretor', 'diretor.e2e@test.local'],
    ['Usuario', 'usuario.pe@test.local'],
  ]) {
    const token = await signIn(email);
    const res = await reprocess(token);
    check(
      `${papel} NÃO consegue reprocessar o inbound`,
      res.status === 403,
      `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 120)}`
    );
  }

  // Sem autenticação nenhuma.
  const semAuth = await fetch(`${API}/api/mail?route=reprocess-inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days: 1 }),
  });
  check('sem autenticação é recusado', semAuth.status === 401 || semAuth.status === 403, `HTTP ${semAuth.status}`);

  // Admin continua conseguindo, e a execução deixa trilha.
  const antes = (
    await db.collection('auditLogs').where('action', '==', 'mail.reprocess-inbound').get()
  ).size;
  const adminToken = await signIn('admin@test.local');
  const admin = await reprocess(adminToken, 1);
  check('Admin continua conseguindo reprocessar', admin.status === 200, `HTTP ${admin.status}`);

  const depoisSnap = await db
    .collection('auditLogs')
    .where('action', '==', 'mail.reprocess-inbound')
    .get();
  check(
    'execução do Admin gerou registro de auditoria',
    depoisSnap.size === antes + 1,
    `antes=${antes} depois=${depoisSnap.size}`
  );

  const registro = depoisSnap.docs
    .map(doc => doc.data())
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];
  check('auditoria identifica QUEM disparou', Boolean(String(registro?.actor || '').trim()), String(registro?.actor));
  check(
    'auditoria guarda a JANELA reprocessada',
    Number(registro?.before?.windowDays) === 1 && Boolean(registro?.before?.since),
    `windowDays=${registro?.before?.windowDays} since=${registro?.before?.since}`
  );
  check(
    'auditoria guarda o RESULTADO da execução',
    registro?.after != null && typeof registro.after === 'object',
    JSON.stringify(registro?.after || null).slice(0, 120)
  );

  for (const doc of depoisSnap.docs) await doc.ref.delete();

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('FALHOU  erro inesperado —', error);
  process.exit(1);
});
