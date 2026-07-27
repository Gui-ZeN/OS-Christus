// Teste de integração do BACKFILL de histórico (emulador).
// Valida o dry-run (não escreve), a migração real, a preservação de entradas
// LEGADAS SEM id (que antes sumiam ao ligar a flag) e a idempotência.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn() {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'Test@123456', returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.idToken) throw new Error(`sem idToken: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function callBackfill(token, body) {
  const res = await fetch(`${API}/api/ticket-history-backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.result;
}

const IDS = ['OS-BF01', 'OS-BF02', 'OS-BF03'];
async function cleanup() {
  for (const id of IDS) {
    const ref = db.collection('tickets').doc(id);
    const sub = await ref.collection('historyEntries').get();
    await Promise.all(sub.docs.map(d => d.ref.delete()));
    await ref.delete().catch(() => {});
  }
}

const base = new Date('2026-03-01T12:00:00.000Z').getTime();
const entry = (i, withId) => ({
  ...(withId ? { id: `x${i}` } : {}), // entrada LEGADA sem id — o caso de risco
  type: 'tech',
  sender: 'Ana (Gestor)',
  text: `entrada ${i}`,
  visibility: 'internal',
  time: new Date(base + i * 60000),
});

await cleanup();

// OS legada com 5 entradas, 2 SEM id
await db.collection('tickets').doc('OS-BF01').set({
  id: 'OS-BF01', subject: 'legada com entradas sem id', status: 'Nova OS',
  regionId: 'reg-1', siteId: 'site-1',
  history: [entry(0, true), entry(1, false), entry(2, true), entry(3, false), entry(4, true)],
  createdAt: new Date(), updatedAt: new Date(),
});
// OS legada normal
await db.collection('tickets').doc('OS-BF02').set({
  id: 'OS-BF02', subject: 'legada normal', status: 'Nova OS',
  regionId: 'reg-1', siteId: 'site-1',
  history: [entry(10, true), entry(11, true), entry(12, true)],
  createdAt: new Date(), updatedAt: new Date(),
});
// OS já migrada — deve ser PULADA
await db.collection('tickets').doc('OS-BF03').set({
  id: 'OS-BF03', subject: 'ja migrada', status: 'Nova OS',
  regionId: 'reg-1', siteId: 'site-1',
  history: [entry(20, true)],
  historySubcollectionReady: true,
  createdAt: new Date(), updatedAt: new Date(),
});

const token = await signIn();

// ---------- 1) DRY-RUN: não pode escrever nada ----------
const dry = await callBackfill(token, { limit: 50, dryRun: true });
const subAfterDry = await db.collection('tickets').doc('OS-BF01').collection('historyEntries').get();
const flagAfterDry = (await db.collection('tickets').doc('OS-BF01').get()).data().historySubcollectionReady;

check('dry-run reporta que é ensaio', dry.dryRun === true);
check('dry-run NÃO criou docs na subcoleção', subAfterDry.size === 0, `subcoleção=${subAfterDry.size}`);
check('dry-run NÃO ligou a flag', flagAfterDry !== true, `flag=${JSON.stringify(flagAfterDry)}`);
check('dry-run não contabiliza cópia', dry.copiedEntries === 0, `copiedEntries=${dry.copiedEntries}`);
check(
  'dry-run CONTA as entradas legadas sem id (o caso de perda)',
  dry.entriesWithoutId >= 2,
  `entriesWithoutId=${dry.entriesWithoutId}`
);
check('dry-run pula OS já migrada', dry.alreadyMigrated >= 1, `alreadyMigrated=${dry.alreadyMigrated}`);
check('dry-run estima entradas a copiar', dry.entriesToCopy >= 8, `entriesToCopy=${dry.entriesToCopy}`);
check('dry-run traz amostra para inspeção', Array.isArray(dry.sample) && dry.sample.length > 0, `sample=${dry.sample?.length}`);

// ---------- 2) EXECUÇÃO REAL ----------
const real = await callBackfill(token, { limit: 50 });
const bf01 = await db.collection('tickets').doc('OS-BF01').get();
const bf01Sub = await db.collection('tickets').doc('OS-BF01').collection('historyEntries').get();

check('real copiou entradas', real.copiedEntries > 0, `copiedEntries=${real.copiedEntries}`);
check('real ligou a flag', bf01.data().historySubcollectionReady === true);
check(
  'NENHUMA entrada perdida: as 5 (incluindo 2 sem id) foram para a subcoleção',
  bf01Sub.size === 5,
  `subcoleção=${bf01Sub.size} (esperado 5)`
);
check(
  'entradas legadas sem id receberam id determinístico',
  bf01Sub.docs.filter(d => String(d.data().id || '').startsWith('legacy-')).length === 2,
  bf01Sub.docs.map(d => d.data().id).join(',')
);
check(
  'conteúdo preservado (sender/text intactos)',
  bf01Sub.docs.every(d => d.data().sender === 'Ana (Gestor)') &&
    bf01Sub.docs.some(d => d.data().text === 'entrada 1'),
  ''
);

// ---------- 3) IDEMPOTÊNCIA: rodar de novo não duplica ----------
const again = await callBackfill(token, { limit: 50 });
const bf01SubAgain = await db.collection('tickets').doc('OS-BF01').collection('historyEntries').get();
check('re-execução não duplica entradas', bf01SubAgain.size === 5, `subcoleção=${bf01SubAgain.size}`);
check(
  're-execução pula tudo que já migrou (pendentes = 0)',
  again.pendingTickets === 0,
  `pendingTickets=${again.pendingTickets} alreadyMigrated=${again.alreadyMigrated}`
);

// ---------- 4) leitura pós-migração devolve o histórico completo ----------
const { readTicketHistoryFromSubcollection } = await import('../../api/_lib/tickets.js');
const hydrated = await readTicketHistoryFromSubcollection(db.collection('tickets').doc('OS-BF01'), []);
check('leitura hidratada devolve as 5 entradas', hydrated.length === 5, `hidratado=${hydrated.length}`);

await cleanup();

const failed = results.filter(r => !r.pass).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
