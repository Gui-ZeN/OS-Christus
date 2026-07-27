// Teste de integração do CUTOVER do histórico (emulador).
// Cobre as 3 regressões que o corte do array embutido causou na 1ª tentativa:
//   A1 reescrita retroativa do sender ao reenviar histórico paginado
//   A2 historyTimeEdit virando no-op para entrada fora da janela
//   A3 duplicação copiando só a janela
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';

const API = 'http://127.0.0.1:3001';
const TICKET = 'OS-CUT01';
const TOTAL = 60;
const WINDOW = 50;
const ORIGINAL_SENDER = 'Ana (Gestor)';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// Importa a funcao REAL do servidor: reimplementar o hash aqui divergiria do
// separador usado la e o teste passaria/falharia pelo motivo errado.
const { ticketHistoryEntryDocumentId: docIdFor } = await import('../../api/_lib/tickets.js');

async function signIn() {
  const res = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.local', password: 'Test@123456', returnSecureToken: true }),
    }
  );
  const json = await res.json();
  if (!json.idToken) throw new Error(`sem idToken: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function seed() {
  const ref = db.collection('tickets').doc(TICKET);
  const old = await ref.collection('historyEntries').get();
  await Promise.all(old.docs.map(d => d.ref.delete()));

  const base = new Date('2026-01-01T12:00:00.000Z').getTime();
  const entries = Array.from({ length: TOTAL }, (_, i) => ({
    id: `e${i}`,
    type: 'tech',
    sender: ORIGINAL_SENDER,
    text: `entrada ${i}`,
    visibility: 'internal',
    time: new Date(base + i * 60000),
  }));

  // subcoleção = fonte da verdade (tudo); embutido = só a janela recente
  let batch = db.batch();
  entries.forEach((e, i) => {
    batch.set(ref.collection('historyEntries').doc(docIdFor(TICKET, e.id)), { ...e, ticketId: TICKET });
    if ((i + 1) % 400 === 0) batch = db.batch();
  });
  await batch.commit();

  await ref.set({
    id: TICKET,
    subject: 'cutover it',
    status: 'Nova OS',
    requester: 'Solicitante',
    requesterEmail: 'req@test.local',
    regionId: 'reg-1',
    siteId: 'site-1',
    history: entries.slice(-WINDOW),
    historySubcollectionReady: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return entries;
}

const token = await signIn();
const entries = await seed();
const ref = db.collection('tickets').doc(TICKET);

// ---------- PERF: listagem não hidrata a subcoleção inteira ----------
const listRes = await fetch(`${API}/api/tickets`, {
  headers: { Authorization: `Bearer ${token}` },
});
const listJson = await listRes.json().catch(() => ({}));
const listedTicket = (listJson?.tickets || []).find(ticket => ticket.id === TICKET);
check(
  'PERF: listagem devolve somente a janela embutida do histórico',
  listRes.ok && listedTicket?.history?.length === WINDOW,
  `HTTP ${listRes.status} histórico=${listedTicket?.history?.length ?? 'ausente'} (janela=${WINDOW})`
);

// ---------- A1: cliente paginou e reenvia TUDO + 1 nova ----------
const novaId = `nova-${Date.now()}`;
const patch = await fetch(`${API}/api/tickets`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    id: TICKET,
    updates: {
      history: [
        ...entries.map(e => ({ ...e, time: e.time.toISOString() })), // histórico paginado inteiro
        { id: novaId, type: 'tech', sender: 'Ana (Gestor)', text: 'mensagem nova', visibility: 'internal', time: new Date().toISOString() },
      ],
    },
  }),
});
const patchJson = await patch.json().catch(() => ({}));
check('PATCH aceito', patch.ok, patch.ok ? '' : `HTTP ${patch.status} ${JSON.stringify(patchJson).slice(0, 200)}`);

const afterDoc = await ref.get();
const afterSub = await ref.collection('historyEntries').get();
const subById = new Map(afterSub.docs.map(d => [d.data().id, d.data()]));

check(
  'A1: sender de entrada FORA da janela preservado (sem forja retroativa)',
  subById.get('e0')?.sender === ORIGINAL_SENDER,
  `e0.sender=${JSON.stringify(subById.get('e0')?.sender)}`
);
check(
  'A1: sender de entrada DENTRO da janela preservado',
  subById.get('e59')?.sender === ORIGINAL_SENDER,
  `e59.sender=${JSON.stringify(subById.get('e59')?.sender)}`
);
check(
  'nova entrada persistida na subcoleção',
  subById.has(novaId),
  `total subcoleção=${afterSub.size} (esperado ${TOTAL + 1})`
);
check('sem duplicação de entradas', afterSub.size === TOTAL + 1, `size=${afterSub.size}`);
check(
  'CORTE: array embutido limitado à janela',
  Array.isArray(afterDoc.data().history) && afterDoc.data().history.length <= WINDOW,
  `embutido=${afterDoc.data().history?.length}`
);
check(
  'CORTE: entrada nova ficou na janela (é a mais recente)',
  (afterDoc.data().history || []).some(e => e.id === novaId),
  ''
);

// ---------- A2: timeEdit de entrada FORA da janela ----------
const novoTime = new Date('2027-03-03T15:30:00.000Z');
const editRes = await fetch(`${API}/api/tickets`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    id: TICKET,
    updates: {},
    historyTimeEdit: { id: 'e0', time: novoTime.toISOString() },
  }),
});
const editedSnap = await ref.collection('historyEntries').doc(docIdFor(TICKET, 'e0')).get();
const editedTime = editedSnap.data()?.time?.toDate?.();
check(
  'A2: historyTimeEdit funciona para entrada fora da janela',
  editRes.ok && editedTime?.getTime() === novoTime.getTime(),
  `HTTP ${editRes.status} time=${editedTime?.toISOString()}`
);
check(
  'A2: edição de horário NÃO alterou o texto/sender',
  editedSnap.data()?.sender === ORIGINAL_SENDER && editedSnap.data()?.text === 'entrada 0',
  ''
);

// ---------- A3: duplicação de OS migrada ----------
const dupRes = await fetch(`${API}/api/tickets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ ticket: { duplicateFromTicketId: TICKET } }),
});
const dupJson = await dupRes.json().catch(() => ({}));
const dupId = dupJson?.ticket?.id;
if (dupId) {
  const dupSub = await db.collection('tickets').doc(dupId).collection('historyEntries').get();
  check(
    'A3: duplicata recebe o histórico COMPLETO (não só a janela)',
    dupSub.size >= TOTAL + 1,
    `duplicata=${dupId} entradas=${dupSub.size} (origem tinha ${TOTAL + 1})`
  );
  await Promise.all(dupSub.docs.map(d => d.ref.delete()));
  await db.collection('tickets').doc(dupId).delete();
} else {
  check('A3: duplicação executou', false, `HTTP ${dupRes.status} ${JSON.stringify(dupJson).slice(0, 200)}`);
}

// ---------- N1: caminho PÚBLICO (tracking) também corta o embutido ----------
// Sem o corte aqui, o embutido de uma OS migrada cresce +1 a cada mensagem do
// solicitante e só seria recortado se um PATCH do painel viesse depois.
{
  const trackingToken = `trk_cutover${Date.now().toString(16)}`;
  await ref.set({ trackingToken }, { merge: true });
  const embutidoAntes = (await ref.get()).data().history?.length ?? 0;

  const msgRes = await fetch(`${API}/api/tickets`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackingToken, publicMessage: 'mensagem do solicitante pelo link' }),
  });
  const afterMsg = await ref.get();
  const embutidoDepois = afterMsg.data().history?.length ?? 0;
  const subDepois = await ref.collection('historyEntries').get();

  check(
    'N1: mensagem pública NÃO faz o embutido passar da janela',
    msgRes.ok && embutidoDepois <= WINDOW,
    `HTTP ${msgRes.status} antes=${embutidoAntes} depois=${embutidoDepois} (janela=${WINDOW})`
  );
  check(
    'N1: a mensagem pública foi para a subcoleção',
    subDepois.docs.some(d => d.data().text === 'mensagem do solicitante pelo link'),
    `subcoleção=${subDepois.size}`
  );
}

// ---------- Cap de dedup: histórico maior que o limite de lookup ----------
// O array do cliente é cronológico; um slice cru pegaria as MAIS ANTIGAS e
// descartaria a mensagem recém-escrita (perda silenciosa). Aqui o total de
// candidatos (>200) força o cap a agir.
const BIG = 'OS-CUT02';
const BIG_TOTAL = 260;
{
  const bigRef = db.collection('tickets').doc(BIG);
  const oldSub = await bigRef.collection('historyEntries').get();
  await Promise.all(oldSub.docs.map(d => d.ref.delete()));

  const base = new Date('2026-02-01T12:00:00.000Z').getTime();
  const bigEntries = Array.from({ length: BIG_TOTAL }, (_, i) => ({
    id: `b${i}`,
    type: 'tech',
    sender: ORIGINAL_SENDER,
    text: `entrada ${i}`,
    visibility: 'internal',
    time: new Date(base + i * 60000),
  }));
  for (let start = 0; start < bigEntries.length; start += 400) {
    const batch = db.batch();
    for (const e of bigEntries.slice(start, start + 400)) {
      batch.set(bigRef.collection('historyEntries').doc(docIdFor(BIG, e.id)), { ...e, ticketId: BIG });
    }
    await batch.commit();
  }
  await bigRef.set({
    id: BIG,
    subject: 'cutover cap',
    status: 'Nova OS',
    requester: 'Solicitante',
    requesterEmail: 'req@test.local',
    regionId: 'reg-1',
    siteId: 'site-1',
    history: bigEntries.slice(-WINDOW),
    historySubcollectionReady: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const capNovaId = `nova-cap-${Date.now()}`;
  const capRes = await fetch(`${API}/api/tickets`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      id: BIG,
      updates: {
        history: [
          ...bigEntries.map(e => ({ ...e, time: e.time.toISOString() })),
          { id: capNovaId, type: 'tech', sender: ORIGINAL_SENDER, text: 'nova apos o cap', visibility: 'internal', time: new Date().toISOString() },
        ],
      },
    }),
  });
  const capSub = await bigRef.collection('historyEntries').get();
  const capById = new Map(capSub.docs.map(d => [d.data().id, d.data()]));
  check(
    'CAP: mensagem nova NÃO é descartada quando os candidatos passam do limite',
    capRes.ok && capById.has(capNovaId),
    `HTTP ${capRes.status} candidatos>${BIG_TOTAL - WINDOW} total=${capSub.size}`
  );
  check(
    'CAP: sender das antigas segue preservado',
    capById.get('b0')?.sender === ORIGINAL_SENDER,
    `b0.sender=${JSON.stringify(capById.get('b0')?.sender)}`
  );

  await Promise.all(capSub.docs.map(d => d.ref.delete()));
  await bigRef.delete();
}

const failed = results.filter(r => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} OK ===`);
process.exit(failed.length ? 1 : 0);
