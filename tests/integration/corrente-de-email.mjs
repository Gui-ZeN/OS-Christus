/**
 * A CORRENTE DE E-MAIL DE UMA OS — reconstruída contra o caminho de produção.
 *
 * O relato era cru ("os e-mails não estão ficando na mesma corrente") e o
 * threading não tinha teste nenhum: `emailThreading.test.ts` cobre os helpers
 * PUROS (assunto, normalização de token), e ninguém verificava a única coisa que
 * decide o agrupamento na caixa de quem recebe — os cabeçalhos que saem no fio.
 *
 * Aqui o transporte do Gmail é instrumentado: cada envio tem o MIME cru
 * capturado, então `Message-Id`/`In-Reply-To`/`References` conferidos abaixo são
 * LITERALMENTE os que sairiam. O resto (Firestore, authz, templates, inbound) é
 * o código de produção, contra o emulador.
 *
 * A INVARIANTE, que é a regra do RFC 5322 §3.6.4: todo Message-Id citado em
 * `In-Reply-To`/`References` tem que ser o de uma mensagem que EXISTE. Referência
 * para um id que nunca foi emitido não encadeia nada — e não gera erro nenhum,
 * que é por que isto passou meses invisível.
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

// ── o servidor de e-mail falso ──────────────────────────────────────────────
// Só o transporte é falso. `buildRawMessage` (api/_lib/gmail.js) é o de verdade,
// e é dele que sai o MIME lido aqui.
const enviados = [];
const caixaDeEntrada = [];

function cabecalhosDoRaw(raw) {
  const texto = Buffer.from(String(raw).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const headers = {};
  for (const linha of texto.split('\r\n\r\n')[0].split('\r\n')) {
    const i = linha.indexOf(':');
    if (i > 0) headers[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return headers;
}

let contador = 0;
// Quando ligado, o provedor recusa QUALQUER envio que carregue contexto de
// thread — é o que dispara os caminhos de recuperação do `handleSend`.
let recusarEnvioEncadeado = false;
google.gmail = () => ({
  users: {
    getProfile: async () => ({ data: { emailAddress: 'os@christus.com.br' } }),
    messages: {
      send: async ({ requestBody }) => {
        const headers = cabecalhosDoRaw(requestBody.raw);
        if (recusarEnvioEncadeado && (requestBody.threadId || headers['In-Reply-To'] || headers.References)) {
          const erro = new Error('Requested entity was not found.');
          erro.response = { status: 404, data: { error: { message: 'Requested entity was not found.' } } };
          throw erro;
        }
        contador += 1;
        const threadId = requestBody.threadId || `gthread-${contador}`;
        enviados.push({ headers, threadId });
        return { data: { id: `gmail-interno-${contador}`, threadId } };
      },
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

const TICKET = 'OS-COR01';
const SOLICITANTE = 'solicitante@cliente.local';
const RESPOSTA_DO_CLIENTE = '<resposta-cliente-1@cliente.local>';

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
  const ref = db.collection('emailThreads').doc(TICKET);
  for (const d of (await ref.collection('messages').get()).docs) await d.ref.delete();
  await ref.delete().catch(() => {});
  await db.collection('tickets').doc(TICKET).delete().catch(() => {});
  for (const col of ['ticketInbound', 'emailEvents']) {
    for (const d of (await db.collection(col).where('ticketId', '==', TICKET).get()).docs) await d.ref.delete();
  }
  // O inbound é deduplicado em DOIS lugares, e os dois sobrevivem à execução:
  // `config/gmailSync` (ids já varridos) e `inboundMessageLocks` (o lock por
  // mensagem, que fica com status `done` de propósito). Sem zerar os dois, a 2ª
  // execução mede uma cadeia SEM a resposta do cliente — e passa pelo motivo errado.
  await db.collection('config').doc('gmailSync').delete().catch(() => {});
  const locks = await db.collection('inboundMessageLocks').where('messageId', '==', RESPOSTA_DO_CLIENTE).get();
  for (const d of locks.docs) await d.ref.delete();
}

await limpar();

// ── a OS nasce PELA WEB (não por e-mail) ────────────────────────────────────
const agora = new Date();
await db.collection('tickets').doc(TICKET).set({
  id: TICKET,
  subject: 'Vazamento no banheiro do 2o andar',
  status: 'Nova OS',
  requester: 'Maria Solicitante',
  requesterEmail: SOLICITANTE,
  region: 'Fortaleza',
  sede: 'PQL3',
  regionId: 'r1',
  siteId: 's1',
  trackingToken: 'tok-cor01',
  createdAt: agora,
  time: agora,
  updatedAt: agora,
  history: [],
});

const token = await login();

// 1. confirmação ao solicitante (fluxo público de criação)
await chamar('send', { body: { ticketId: TICKET, toEmail: SOLICITANTE, trigger: 'EMAIL-NOVA-OS' } });

// 2. a equipe responde pela conversa da OS
await chamar('send', {
  token,
  body: {
    ticketId: TICKET,
    toEmail: SOLICITANTE,
    trigger: 'EMAIL-NOVA-MENSAGEM',
    templateData: { title: 'Nova mensagem', bodyText: 'Ja acionamos a manutencao.', useBodyOnly: true },
  },
});

// 3. o solicitante responde — inbound REAL, pela rota gmail-sync
const ultimaSaida = enviados[enviados.length - 1].headers;
caixaDeEntrada.push({
  id: 'g-inb-1',
  threadId: enviados[0].threadId,
  historyId: '1',
  labelIds: ['INBOX'],
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From', value: 'Maria Solicitante <solicitante@cliente.local>' },
      { name: 'To', value: 'os@christus.com.br' },
      { name: 'Subject', value: `Re: ${ultimaSaida.Subject}` },
      { name: 'Message-Id', value: RESPOSTA_DO_CLIENTE },
      { name: 'In-Reply-To', value: ultimaSaida['Message-Id'] },
      { name: 'References', value: [ultimaSaida.References, ultimaSaida['Message-Id']].filter(Boolean).join(' ') },
    ],
    mimeType: 'text/plain',
    body: { data: b64url('Obrigada, aguardo.') },
  },
});
await chamar('gmail-sync', { query: { secret: 'segredo-de-teste' } });

// 4. a equipe responde de volta
await chamar('send', {
  token,
  body: {
    ticketId: TICKET,
    toEmail: SOLICITANTE,
    trigger: 'EMAIL-NOVA-MENSAGEM',
    templateData: { title: 'Nova mensagem', bodyText: 'Equipe passa amanha.', useBodyOnly: true },
  },
});

// ── a cadeia, lado a lado ───────────────────────────────────────────────────
const thread = (await db.collection('emailThreads').doc(TICKET).get()).data() || {};
const gravadas = (await db.collection('emailThreads').doc(TICKET).collection('messages').get()).docs
  .map(d => d.data())
  .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
const eventos = (await db.collection('emailEvents').where('ticketId', '==', TICKET).get()).docs.map(d => d.data());
const ticket = (await db.collection('tickets').doc(TICKET).get()).data() || {};

console.log(`\n──────── emailThreads/${TICKET} ────────`);
console.log(`  rootMessageId : ${thread.rootMessageId}`);
console.log(`  lastMessageId : ${thread.lastMessageId}`);
console.log(`  gmailThreadId : ${thread.gmailThreadId}`);
console.log(`  messageCount  : ${thread.messageCount === undefined ? '(o campo não existe)' : thread.messageCount}`);
console.log(`  references    : ${JSON.stringify(thread.references)}`);

console.log('\n──────── o que SAIU no fio ────────');
enviados.forEach((e, i) => {
  console.log(`  [saída ${i + 1}] ${e.headers.Subject}`);
  console.log(`      Message-Id : ${e.headers['Message-Id']}`);
  console.log(`      In-Reply-To: ${e.headers['In-Reply-To'] || '(ausente)'}`);
  console.log(`      References : ${e.headers.References || '(ausente)'}`);
});

console.log('\n──────── emailThreads/messages ────────');
gravadas.forEach((m, i) => {
  console.log(`  [${i + 1}] ${m.direction}  messageId=${m.messageId}  inReplyTo=${m.inReplyTo || '(nulo)'}`);
});

console.log('\n──────── emailEvents ────────');
eventos.forEach(e => console.log(`  ${e.type}/${e.status}  ${e.messageId || ''} ${e.error || ''}`));

console.log('\n──────── history[] ────────');
(ticket.history || []).forEach(h => console.log(`  ${h.type}/${h.visibility} — ${String(h.text).slice(0, 70)}`));
console.log('');

// ── as afirmações ───────────────────────────────────────────────────────────
const emitidos = new Set(enviados.map(e => e.headers['Message-Id']));
emitidos.add(RESPOSTA_DO_CLIENTE);

check(
  'a raiz gravada na thread é o Message-Id de uma mensagem que existe',
  emitidos.has(thread.rootMessageId),
  `rootMessageId=${thread.rootMessageId}`
);

for (const [i, e] of enviados.entries()) {
  const irt = e.headers['In-Reply-To'];
  if (!irt) continue;
  check(
    `saída ${i + 1}: In-Reply-To aponta para mensagem existente`,
    emitidos.has(irt),
    `In-Reply-To=${irt}`
  );
}

for (const [i, e] of enviados.entries()) {
  const refs = String(e.headers.References || '').split(/\s+/).filter(Boolean);
  const fantasmas = refs.filter(r => !emitidos.has(r));
  check(
    `saída ${i + 1}: References só cita mensagens existentes`,
    fantasmas.length === 0,
    fantasmas.length ? `fantasmas: ${fantasmas.join(' ')}` : `${refs.length} referência(s)`
  );
}

// A cadeia só é UMA se cada resposta se pendura na anterior.
const primeiraSaida = enviados[0]?.headers['Message-Id'];
check(
  'a 2a saída se pendura na 1a (In-Reply-To ou References citam o Message-Id dela)',
  Boolean(primeiraSaida) &&
    (enviados[1]?.headers['In-Reply-To'] === primeiraSaida ||
      String(enviados[1]?.headers.References || '').includes(primeiraSaida)),
  `1a=${primeiraSaida}`
);

// ── segunda causa: o envio que o provedor recusou ───────────────────────────
// O Gmail responde 404 para o `threadId` guardado (thread apagada da caixa, id
// vencido). O `handleSend` reenvia sem contexto de thread — o que é correto,
// porque a alternativa é não entregar nada. O que NÃO pode acontecer é a corrente
// gravada encolher: se o doc esquecer os Message-Id anteriores, a mensagem
// SEGUINTE também nasce órfã e a conversa fica partida para sempre.
const TICKET_B = 'OS-COR02';
const refB = db.collection('emailThreads').doc(TICKET_B);
for (const d of (await refB.collection('messages').get()).docs) await d.ref.delete();
await refB.delete().catch(() => {});
const agoraB = new Date();
await db.collection('tickets').doc(TICKET_B).set({
  id: TICKET_B,
  subject: 'Porta emperrada',
  status: 'Nova OS',
  requester: 'Maria Solicitante',
  requesterEmail: SOLICITANTE,
  region: 'Fortaleza',
  sede: 'PQL3',
  regionId: 'r1',
  siteId: 's1',
  trackingToken: 'tok-cor02',
  createdAt: agoraB,
  time: agoraB,
  updatedAt: agoraB,
  history: [],
});

enviados.length = 0;
await chamar('send', { body: { ticketId: TICKET_B, toEmail: SOLICITANTE, trigger: 'EMAIL-NOVA-OS' } });
await chamar('send', {
  token,
  body: { ticketId: TICKET_B, toEmail: SOLICITANTE, trigger: 'EMAIL-NOVA-MENSAGEM', templateData: { bodyText: 'a', useBodyOnly: true } },
});
const anteriores = enviados.map(e => e.headers['Message-Id']);
const threadIdAntigo = (await refB.get()).data()?.gmailThreadId;

recusarEnvioEncadeado = true;
await chamar('send', {
  token,
  body: { ticketId: TICKET_B, toEmail: SOLICITANTE, trigger: 'EMAIL-NOVA-MENSAGEM', templateData: { bodyText: 'b', useBodyOnly: true } },
});
recusarEnvioEncadeado = false;

const threadB = (await refB.get()).data() || {};
console.log(`\n──────── ${TICKET_B}: depois do envio recusado (404) ────────`);
console.log(`  references   : ${JSON.stringify(threadB.references)}`);
console.log(`  gmailThreadId: ${threadIdAntigo} → ${threadB.gmailThreadId}`);
console.log('');

const perdidos = anteriores.filter(id => !threadB.references.includes(id));
check(
  'o envio recusado não apaga da thread os Message-Id anteriores',
  perdidos.length === 0,
  perdidos.length ? `sumiram: ${perdidos.join(' ')}` : `${anteriores.length} preservado(s)`
);
check(
  'a thread do Gmail recusada não é reaproveitada no próximo envio',
  threadB.gmailThreadId !== threadIdAntigo,
  `gmailThreadId=${threadB.gmailThreadId}`
);

const falhas = results.filter(r => !r.pass).length;
console.log(`\n${falhas === 0 ? 'TUDO PASSOU' : `${falhas} FALHA(S)`} — ${results.length} verificações`);
process.exit(falhas === 0 ? 0 : 1);
