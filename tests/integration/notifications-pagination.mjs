import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';
const USER_ID = 'user-admin-test';
const TOTAL = 105;
const PREFIX = 'notif-page-test-';
const ids = Array.from({ length: TOTAL }, (_, index) => `${PREFIX}${String(index).padStart(3, '0')}`);

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(email = 'admin@test.local') {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'Test@123456',
        returnSecureToken: true,
      }),
    }
  );
  const json = await res.json();
  if (!json.idToken) throw new Error(`sem idToken: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function cleanup() {
  const states = db.collection('users').doc(USER_ID).collection('notificationStates');
  for (let start = 0; start < ids.length; start += 400) {
    const batch = db.batch();
    for (const id of ids.slice(start, start + 400)) {
      batch.delete(db.collection('notifications').doc(id));
      batch.delete(states.doc(id));
    }
    await batch.commit();
  }
}

await cleanup();
const base = new Date('2026-07-27T12:00:00.000Z').getTime();
for (let start = 0; start < ids.length; start += 400) {
  const batch = db.batch();
  ids.slice(start, start + 400).forEach((id, offset) => {
    const index = start + offset;
    const createdAt = new Date(base + index * 1_000);
    batch.set(db.collection('notifications').doc(id), {
      id,
      type: 'info',
      title: `Notificação ${index}`,
      description: 'Teste de paginação',
      audienceRoles: ['Admin'],
      time: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  });
  await batch.commit();
}

const token = await signIn();
const receivedIds = [];
const pageSizes = [];
let cursor = null;
do {
  const query = new URLSearchParams({ limit: '50' });
  if (cursor) query.set('cursor', cursor);
  const res = await fetch(`${API}/api/notifications?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET notificações HTTP ${res.status}: ${JSON.stringify(json)}`);
  pageSizes.push(json.notifications.length);
  receivedIds.push(...json.notifications.map(item => item.id));
  cursor = json.nextCursor;
} while (cursor);

const receivedTestIds = receivedIds.filter(id => id.startsWith(PREFIX));
check(
  'paginação percorre todas as notificações de teste',
  new Set(receivedTestIds).size === TOTAL,
  `recebidas=${new Set(receivedTestIds).size} esperadas=${TOTAL}`
);
check(
  'nenhuma página ultrapassa o limite solicitado',
  pageSizes.every(size => size <= 50),
  `páginas=${pageSizes.join(',')}`
);
check(
  'cursores não duplicam notificações entre páginas',
  new Set(receivedIds).size === receivedIds.length,
  `itens=${receivedIds.length} únicos=${new Set(receivedIds).size}`
);

const invalidCursor = await fetch(`${API}/api/notifications?limit=50&cursor=invalido`, {
  headers: { Authorization: `Bearer ${token}` },
});
check('cursor inválido retorna HTTP 400', invalidCursor.status === 400, `HTTP ${invalidCursor.status}`);

const markAll = await fetch(`${API}/api/notifications`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ action: 'markAllRead' }),
});
const stateCollection = db.collection('users').doc(USER_ID).collection('notificationStates');
const stateSnaps = await db.getAll(...ids.map(id => stateCollection.doc(id)));
check('marcar todas percorre todas as páginas', markAll.ok && stateSnaps.every(doc => Boolean(doc.data()?.readAt)));

// --- Escopo estreito: a página tem que ENCHER, não vir vazia -----------------
// Regressão do P2 da 4ª auditoria: o `limit` era aplicado na query e o filtro de
// audiência só depois, então quem tem escopo estreito recebia página vazia (e
// parava de paginar) mesmo havendo notificações acessíveis mais adiante.
const SCOPE_PREFIX = 'notif-scope-test-';
const scopeIds = Array.from({ length: 60 }, (_, i) => `${SCOPE_PREFIX}${String(i).padStart(3, '0')}`);

async function cleanupScope() {
  const gestorStates = db.collection('users').doc('user-gestor-e2e').collection('notificationStates');
  const batch = db.batch();
  for (const id of scopeIds) {
    batch.delete(db.collection('notifications').doc(id));
    batch.delete(gestorStates.doc(id));
  }
  await batch.commit();
}

await cleanupScope();
const scopeBase = new Date('2026-07-28T12:00:00.000Z').getTime();
{
  const batch = db.batch();
  scopeIds.forEach((id, index) => {
    // As 40 MAIS RECENTES são só para Admin; as 20 seguintes, para Gestor.
    const createdAt = new Date(scopeBase - index * 1_000);
    batch.set(db.collection('notifications').doc(id), {
      id,
      type: 'info',
      title: `Escopo ${index}`,
      description: 'Teste de escopo',
      audienceRoles: index < 40 ? ['Admin'] : ['Gestor'],
      time: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  });
  await batch.commit();
}

const gestorToken = await signIn('gestor.e2e@test.local');
const scopeRes = await fetch(`${API}/api/notifications?limit=10`, {
  headers: { Authorization: `Bearer ${gestorToken}` },
});
const scopeJson = await scopeRes.json();
const scopeVisible = (scopeJson.notifications || []).filter(item => item.id.startsWith(SCOPE_PREFIX));
check(
  'Gestor recebe a página CHEIA mesmo com 40 notificações de Admin na frente',
  scopeVisible.length === 10,
  `recebidas=${scopeVisible.length} esperadas=10`
);
check(
  'nenhuma notificação de outra audiência vaza na página',
  scopeVisible.every(item => (item.audienceRoles || []).includes('Gestor')),
  scopeVisible.map(item => (item.audienceRoles || []).join('/')).join(',')
);

// --- TTL do estado por usuário ----------------------------------------------
const alvo = scopeVisible[0]?.id;
await fetch(`${API}/api/notifications`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${gestorToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'markRead', id: alvo }),
});
const estado = (
  await db.collection('users').doc('user-gestor-e2e').collection('notificationStates').doc(alvo).get()
).data();
const ttl = estado?.ttlAt?.toDate ? estado.ttlAt.toDate() : estado?.ttlAt;
const diasAteExpirar = ttl ? Math.round((ttl.getTime() - Date.now()) / 86400000) : null;
check(
  'estado de leitura recebe ttlAt (não sobrevive à notificação)',
  diasAteExpirar !== null && diasAteExpirar > 100 && diasAteExpirar <= 121,
  `dias=${diasAteExpirar}`
);

await cleanupScope();


await cleanup();

const failed = results.filter(result => !result.pass).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
