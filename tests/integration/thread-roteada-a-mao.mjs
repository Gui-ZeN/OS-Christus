/**
 * A CONVERSA DE UMA OS APAGADA QUE JÁ FOI ROTEADA PARA UMA OS VIVA.
 *
 * Relato de produção em 09/09/2026, OS-0417: a resposta da Thaís entrou e foi
 * descartada como "A OS desta conversa (OS-0263) foi apagada", mesmo existindo uma
 * OS VIVA nascida daquela mesma conversa. Alguém teve que anexar à mão — pela
 * terceira vez na mesma thread (12/08, 07/09, 09/09). Das 65 mensagens soltas da
 * base, 30 têm esse motivo.
 *
 * A causa: anexar (ou criar OS a partir de) uma mensagem solta NUNCA transferia a
 * posse da thread. A lápide da OS apagada continuava sendo a única dona, e cada
 * resposta nova caía na fila de novo, para sempre.
 *
 * ⚠️ ESTE TESTE EXISTE PARA PROTEGER A LÁPIDE TAMBÉM. A regra dela é deliberada: em
 * 12/08 saíram 105 OS da universidade a pedido da coordenadora, e horas depois um
 * "Ciente. @Fulano" nasceu como OS-0331 — ressuscitando o que alguém decidiu apagar.
 * Por isso o segundo caso abaixo: thread de OS apagada SEM OS viva continua caindo
 * na fila. Consertar o primeiro caso afrouxando o segundo seria trocar de bug.
 *
 * Pré-requisitos: emulador (auth 9099 + firestore 8080) e `npm run dev:seed`.
 */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_PROJECT_ID ||= 'os-christus';
process.env.GMAIL_CLIENT_ID = 'dummy-id';
process.env.GMAIL_CLIENT_SECRET = 'dummy-secret';
process.env.GMAIL_REFRESH_TOKEN = 'dummy-refresh';
process.env.GMAIL_FROM_EMAIL = 'os@christus.com.br';
process.env.TICKET_NOTIFICATION_EMAIL = 'os@christus.com.br';
process.env.GMAIL_SYNC_SECRET = 'segredo-de-teste';
process.env.APP_BASE_URL = 'http://localhost:3000';

import { google } from 'googleapis';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const caixaDeEntrada = [];
google.gmail = () => ({
  users: {
    getProfile: async () => ({ data: { emailAddress: 'os@christus.com.br' } }),
    messages: {
      send: async () => ({ data: { id: 'ignorado', threadId: 'ignorado' } }),
      list: async () => ({ data: { messages: caixaDeEntrada.map(m => ({ id: m.id })) } }),
      get: async ({ id }) => {
        const m = caixaDeEntrada.find(x => x.id === id);
        if (!m) throw new Error(`mensagem ${id} inexistente`);
        return { data: m };
      },
      attachments: { get: async () => ({ data: { data: '' } }) },
    },
  },
});

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const { default: handler } = await import('../../api/mail.js');

const VIVA = 'OS-LAP01';
const MORTA = 'OS-LAP00';
const THREAD = 'gthread-lapide-01';
const THREAD_ORFA = 'gthread-lapide-02';
const MORTA_ORFA = 'OS-LAP02';
const DROP = 'drop-lapide-01';
const RESPOSTA = '<resposta-depois-do-vinculo@cliente.local>';
const RESPOSTA_ORFA = '<resposta-sem-os-viva@cliente.local>';

function chamar(route, { method = 'POST', body = {}, token = null, query = {} } = {}) {
  const req = { method, query: { route, ...query }, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(payload) {
        try { resolve({ status: res.statusCode, json: JSON.parse(payload) }); }
        catch { resolve({ status: res.statusCode, json: payload }); }
      },
    };
    handler(req, res).catch(reject);
  });
}

async function login(email = 'admin@test.local') {
  const r = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test@123456', returnSecureToken: true }),
    }
  );
  const j = await r.json();
  if (!j.idToken) throw new Error(`sem idToken: ${JSON.stringify(j)}`);
  return j.idToken;
}

const b64url = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function limpar() {
  for (const id of [VIVA, MORTA, MORTA_ORFA]) {
    await db.collection('tickets').doc(id).delete().catch(() => {});
    await db.collection('deletedTickets').doc(id).delete().catch(() => {});
    const t = db.collection('emailThreads').doc(id);
    for (const d of (await t.collection('messages').get()).docs) await d.ref.delete();
    await t.delete().catch(() => {});
  }
  for (const th of [THREAD, THREAD_ORFA]) {
    await db.collection('emailThreads').doc(`thread-${th}`).delete().catch(() => {});
  }
  await db.collection('inboundDropped').doc(DROP).delete().catch(() => {});
  for (const col of ['emailEvents', 'ticketInbound']) {
    for (const id of [VIVA, MORTA]) {
      for (const d of (await db.collection(col).where('ticketId', '==', id).get()).docs) await d.ref.delete();
    }
  }
  // Dedup do inbound vive em DOIS lugares e sobrevive à execução: sem zerar, a 2ª
  // rodada mede uma caixa sem as mensagens e passa pelo motivo errado.
  await db.collection('config').doc('gmailSync').delete().catch(() => {});
  for (const mid of [RESPOSTA, RESPOSTA_ORFA]) {
    for (const d of (await db.collection('inboundMessageLocks').where('messageId', '==', mid).get()).docs) {
      await d.ref.delete();
    }
  }
  for (const d of (await db.collection('inboundDropped').where('threadId', 'in', [THREAD, THREAD_ORFA]).get()).docs) {
    await d.ref.delete();
  }
}

await limpar();
const agora = new Date();

// ── o cenário de produção, reconstruído ─────────────────────────────────────
// 1. A OS antiga daquela conversa foi apagada. A lápide guarda a thread.
await db.collection('deletedTickets').doc(MORTA).set({
  ticketId: MORTA,
  gmailThreadId: THREAD,
  subject: '[EUS] - Porta empenando',
  deletedAt: agora,
});

// 2. Uma OS VIVA nasceu da mesma conversa (foi o que aconteceu com a OS-0417).
await db.collection('tickets').doc(VIVA).set({
  id: VIVA,
  subject: '[EUS] - Porta empenando',
  status: 'Nova OS',
  requester: 'Murilo',
  requesterEmail: 'murilo@cliente.local',
  sede: 'PQL3',
  regionId: 'r1',
  siteId: 's1',
  trackingToken: 'tok-lap01',
  createdAt: agora,
  time: agora,
  updatedAt: agora,
  history: [],
});

// 3. Uma mensagem daquela thread está na fila de soltas, como ficou em produção.
await db.collection('inboundDropped').doc(DROP).set({
  fromEmail: 'thais@cliente.local',
  subject: 'Re: [EUS] - Porta empenando',
  text: 'Ciente. Solicitar orçamento.',
  messageId: '<mensagem-solta@cliente.local>',
  threadId: THREAD,
  reason: 'os-apagada',
  deletedTicketId: MORTA,
  status: 'pendente',
  attachmentCount: 0,
  attachments: [],
  receivedAt: agora,
  createdAt: agora,
});

const token = await login();

// 4. Uma PESSOA anexa a mensagem à OS viva — a decisão que o sistema esquecia.
const vinculo = await chamar('dropped-inbound', {
  token,
  body: { id: DROP, action: 'vincular', ticketId: VIVA },
});
check('a pessoa consegue anexar a mensagem solta à OS viva', vinculo.status === 200, `status ${vinculo.status}`);

// ── O TESTE: a PRÓXIMA resposta da mesma conversa ───────────────────────────
caixaDeEntrada.push({
  id: 'g-lap-1',
  threadId: THREAD,
  historyId: '1',
  labelIds: ['INBOX'],
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From', value: 'Thais <thais@cliente.local>' },
      { name: 'To', value: 'os@christus.com.br' },
      { name: 'Subject', value: 'Re: [EUS] - Porta empenando' },
      { name: 'Message-Id', value: RESPOSTA },
      { name: 'In-Reply-To', value: '<mensagem-solta@cliente.local>' },
    ],
    mimeType: 'text/plain',
    body: { data: b64url('Catarina, orçamento pedido.') },
  },
});
await chamar('gmail-sync', { query: { secret: 'segredo-de-teste' } });

const caiuNaFila = await db.collection('inboundDropped').where('messageId', '==', RESPOSTA).get();
check(
  'a resposta seguinte NÃO volta para a fila de mensagens soltas',
  caiuNaFila.empty,
  caiuNaFila.empty ? '' : `motivo: ${caiuNaFila.docs[0].data().reason}`
);

const historico = await db.collection('tickets').doc(VIVA).collection('historyEntries').get();
const embutido = (await db.collection('tickets').doc(VIVA).get()).data()?.history || [];
const chegou = historico.docs.some(d => String(d.data()?.text || '').includes('orçamento pedido'))
  || embutido.some(h => String(h?.text || '').includes('orçamento pedido'));
check('a resposta seguinte entra sozinha na OS viva', chegou);

// ── E A LÁPIDE CONTINUA VALENDO onde ela precisa valer ──────────────────────
// Mesma situação, sem OS viva nenhuma: tem que continuar caindo na fila, senão o
// conserto acima teria ressuscitado o que alguém apagou de propósito.
await db.collection('deletedTickets').doc(MORTA_ORFA).set({
  ticketId: MORTA_ORFA,
  gmailThreadId: THREAD_ORFA,
  subject: '[BN] - Assunto encerrado de propósito',
  deletedAt: agora,
});
caixaDeEntrada.length = 0;
caixaDeEntrada.push({
  id: 'g-lap-2',
  threadId: THREAD_ORFA,
  historyId: '2',
  labelIds: ['INBOX'],
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From', value: 'alguem@cliente.local' },
      { name: 'To', value: 'os@christus.com.br' },
      { name: 'Subject', value: 'Re: [BN] - Assunto encerrado de propósito' },
      { name: 'Message-Id', value: RESPOSTA_ORFA },
    ],
    mimeType: 'text/plain',
    body: { data: b64url('Ciente. Quem faz esse serviço?') },
  },
});
await db.collection('config').doc('gmailSync').delete().catch(() => {});
await chamar('gmail-sync', { query: { secret: 'segredo-de-teste' } });

const orfa = await db.collection('inboundDropped').where('messageId', '==', RESPOSTA_ORFA).get();
check(
  'thread de OS apagada SEM OS viva continua caindo na fila (a lápide não afrouxou)',
  !orfa.empty && orfa.docs[0].data().reason === 'os-apagada',
  orfa.empty ? 'virou OS nova — a lápide foi afrouxada' : `motivo: ${orfa.docs[0].data().reason}`
);

const naoVirouOs = await db.collection('tickets').where('subject', '==', 'Assunto encerrado de propósito').get();
check('e não ressuscitou como OS nova', naoVirouOs.empty);

const falhas = results.filter(r => !r.pass).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas > 0 ? 1 : 0);
