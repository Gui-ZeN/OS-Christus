// Teste de integração do ESCOPO DE LEITURA POR PAPEL no proxy de anexos.
// Antes, ter acesso à OS bastava para baixar QUALQUER anexo dela: o Diretor
// (que não opera o financeiro) conseguia puxar pagamento/medição. A restrição
// por papel existia apenas no upload.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';
const TICKET = 'OS-ROLE01';
const DIRECTOR = { email: 'diretor.teste@test.local', password: 'Test@123456' };

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function authCall(path, body) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${path}?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  return res.json();
}

async function tokenFor(email, password) {
  let json = await authCall('signInWithPassword', { email, password });
  if (!json.idToken) json = await authCall('signUp', { email, password });
  if (!json.idToken) throw new Error(`sem idToken para ${email}: ${JSON.stringify(json)}`);
  return { idToken: json.idToken, uid: json.localId };
}

// GET do anexo: devolve o status (não precisamos do arquivo — o gate de papel é
// avaliado ANTES de qualquer acesso ao Storage).
async function getAttachment(token, path) {
  const url = `${API}/api/attachments?ticketId=${TICKET}&path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  let error = '';
  try {
    error = (await res.clone().json())?.error || '';
  } catch {
    error = '';
  }
  return { status: res.status, error };
}

const quotePath = `attachments/tickets/quotes/${TICKET}/initial-1/quote-1/orcamento.pdf`;
const paymentPath = `attachments/tickets/payments/${TICKET}/payment-1/recibo.pdf`;
const measurementPath = `attachments/tickets/measurements/${TICKET}/measurement-1/medicao.pdf`;

async function cleanup() {
  const ref = db.collection('tickets').doc(TICKET);
  for (const sub of ['quotes', 'payments', 'measurements']) {
    const snap = await ref.collection(sub).get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
  }
  await ref.delete().catch(() => {});
  const users = await db.collection('users').where('email', '==', DIRECTOR.email).get();
  await Promise.all(users.docs.map(d => d.ref.delete()));
}

await cleanup();

const director = await tokenFor(DIRECTOR.email, DIRECTOR.password);
const admin = await tokenFor('admin@test.local', 'Test@123456');

// Diretor designado à OS (é assim que ele ganha acesso ao ticket)
await db.collection('users').doc('user-diretor-teste').set({
  id: 'user-diretor-teste',
  name: 'Diretor Teste',
  email: DIRECTOR.email,
  role: 'Diretor',
  status: 'Ativo',
  active: true,
  authUid: director.uid,
  regionIds: ['reg-1'],
  siteIds: ['site-1'],
});

const ref = db.collection('tickets').doc(TICKET);
await ref.set({
  id: TICKET,
  subject: 'escopo por papel',
  status: 'Aguardando aprovação do orçamento',
  regionId: 'reg-1',
  siteId: 'site-1',
  directorEmails: [DIRECTOR.email],
  createdAt: new Date(),
  updatedAt: new Date(),
});
// Referências reais: o proxy exige que o path exista na OS/subcoleções.
await ref.collection('quotes').doc('quote-1').set({ id: 'quote-1', attachmentPath: quotePath });
await ref.collection('payments').doc('payment-1').set({
  id: 'payment-1',
  attachments: [{ id: 'a1', name: 'recibo.pdf', path: paymentPath }],
});
await ref.collection('measurements').doc('measurement-1').set({
  id: 'measurement-1',
  attachments: [{ id: 'm1', name: 'medicao.pdf', path: measurementPath }],
});

// ---------- Diretor: BLOQUEADO no financeiro ----------
const dirPayment = await getAttachment(director.idToken, paymentPath);
check(
  'Diretor NÃO baixa anexo de PAGAMENTO (403 por papel)',
  dirPayment.status === 403 && /perfil/i.test(dirPayment.error),
  `HTTP ${dirPayment.status} "${dirPayment.error}"`
);

const dirMeasurement = await getAttachment(director.idToken, measurementPath);
check(
  'Diretor NÃO baixa anexo de MEDIÇÃO (403 por papel)',
  dirMeasurement.status === 403 && /perfil/i.test(dirMeasurement.error),
  `HTTP ${dirMeasurement.status} "${dirMeasurement.error}"`
);

// ---------- Diretor: LIBERADO no que precisa aprovar ----------
// Passa do gate de papel; pode falhar depois no Storage (não emulado) — o que
// importa é NÃO ser 403 de perfil.
const dirQuote = await getAttachment(director.idToken, quotePath);
check(
  'Diretor PASSA do gate de papel na COTAÇÃO (precisa para aprovar)',
  !(dirQuote.status === 403 && /perfil/i.test(dirQuote.error)),
  `HTTP ${dirQuote.status} "${dirQuote.error}"`
);

// ---------- Admin: sem restrição de pasta ----------
const adminPayment = await getAttachment(admin.idToken, paymentPath);
check(
  'Admin PASSA do gate de papel no financeiro',
  !(adminPayment.status === 403 && /perfil/i.test(adminPayment.error)),
  `HTTP ${adminPayment.status} "${adminPayment.error}"`
);

await cleanup();

const failed = results.filter(r => !r.pass).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
