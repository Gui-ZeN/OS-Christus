/**
 * QUEM CITA UMA OS SEM FAZER PARTE DELA — contra o caminho de produção.
 *
 * Auditoria de segurança de 14/10/2026, achado ALTO: um e-mail de qualquer pessoa com
 * "OS-0331" no assunto e um endereço próprio em cópia entrava na conversa daquela
 * OS, injetava mensagem e anexo, e o CC do e-mail SUBSTITUÍA o da conversa — que os
 * envios seguintes usam. Os números são sequenciais e a caixa `os@` está no
 * repositório público.
 *
 * Aqui o ataque é montado de verdade (Gmail simulado, resto real contra o emulador):
 *  1. o estranho cai na fila, sem tocar na OS nem no CC;
 *  2. o solicitante continua entrando normalmente;
 *  3. depois que a equipe VINCULA a mensagem dele, o mesmo remetente passa a entrar
 *     sozinho — a decisão de quem triou vale para as próximas.
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

const OS = 'OS-99071';
// OS de OUTRO território (Região Sul): o Gestor do seed só tem Universidade/PQL3.
const OS_SUL = 'OS-99072';
const SOLICITANTE = 'murilo@cliente.local';
const COPIA_LEGITIMA = 'coord@cliente.local';
const ATACANTE = 'atacante@evil.example';
const ESPIAO = 'espiao@evil.example';
const INTRUSO = 'intruso@evil2.example';
const IDS = {
  ataque: '<ataque-1@evil.example>',
  legitima: '<legitima-1@cliente.local>',
  aprovado: '<aprovado-1@evil.example>',
  disfarce: '<disfarce-1@evil.example>',
  intruso: '<intruso-1@evil2.example>',
  sul: '<sul-1@evil.example>',
  colega: '<colega-1@christus.com.br>',
};

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

function mensagem({ id, from, cc, messageId, texto, threadId }) {
  return {
    id,
    threadId,
    historyId: '1',
    labelIds: ['INBOX'],
    internalDate: String(Date.now()),
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'To', value: 'os@christus.com.br' },
        ...(cc ? [{ name: 'Cc', value: cc }] : []),
        { name: 'Subject', value: `Re: ${OS} - Vazamento no bloco B` },
        { name: 'Message-Id', value: messageId },
      ],
      mimeType: 'text/plain',
      body: { data: b64url(texto) },
    },
  };
}

async function sincronizar(msg) {
  caixaDeEntrada.length = 0;
  caixaDeEntrada.push(msg);
  await db.collection('config').doc('gmailSync').delete().catch(() => {});
  await chamar('gmail-sync', { token: 'segredo-de-teste' });
}

async function textosDaOs() {
  const snap = await db.collection('tickets').doc(OS).get();
  const embutido = (snap.data()?.history || []).map(h => String(h?.text || ''));
  const sub = (await db.collection('tickets').doc(OS).collection('historyEntries').get()).docs.map(d =>
    String(d.data()?.text || '')
  );
  const conversa = (await db.collection('emailThreads').doc(OS).collection('messages').get()).docs.map(d =>
    String(d.data()?.text || '')
  );
  return [...embutido, ...sub, ...conversa].join('\n');
}

async function limpar() {
  await db.collection('tickets').doc(OS_SUL).delete().catch(() => {});
  await db.collection('tickets').doc(OS).delete().catch(() => {});
  for (const d of (await db.collection('tickets').doc(OS).collection('historyEntries').get()).docs) await d.ref.delete();
  for (const d of (await db.collection('emailThreads').where('ticketId', '==', OS).get()).docs) {
    for (const m of (await d.ref.collection('messages').get()).docs) await m.ref.delete();
    await d.ref.delete();
  }
  for (const col of ['emailOutbox', 'emailEvents', 'ticketInbound']) {
    for (const d of (await db.collection(col).where('ticketId', '==', OS).get()).docs) await d.ref.delete();
  }
  for (const mid of Object.values(IDS)) {
    for (const d of (await db.collection('inboundMessageLocks').where('messageId', '==', mid).get()).docs) await d.ref.delete();
    for (const d of (await db.collection('inboundDropped').where('messageId', '==', mid).get()).docs) await d.ref.delete();
  }
  await db.collection('config').doc('gmailSync').delete().catch(() => {});
}

await limpar();
const agora = new Date();
await db.collection('tickets').doc(OS).set({
  id: OS,
  subject: 'Vazamento no bloco B',
  status: 'Em andamento',
  requester: 'Murilo',
  requesterEmail: SOLICITANTE,
  sede: 'PQL3',
  regionId: 'r1',
  siteId: 's1',
  trackingToken: 'tok-fora',
  createdAt: agora,
  time: agora,
  updatedAt: agora,
  history: [],
});
await db.collection('emailThreads').doc(OS).set({
  ticketId: OS,
  ccEmail: COPIA_LEGITIMA,
  participants: [SOLICITANTE, COPIA_LEGITIMA],
  updatedAt: agora,
});

// ── 1. O ATAQUE ─────────────────────────────────────────────────────────────
await sincronizar(
  mensagem({
    id: 'g-fora-1',
    threadId: 'gthread-atacante',
    from: `Atacante <${ATACANTE}>`,
    cc: ESPIAO,
    messageId: IDS.ataque,
    texto: 'MENSAGEM INJETADA pelo atacante',
  })
);

const naFila = await db.collection('inboundDropped').where('messageId', '==', IDS.ataque).get();
check(
  'o e-mail do estranho cai na fila de mensagens soltas',
  !naFila.empty && naFila.docs[0].data().reason === 'remetente-desconhecido',
  naFila.empty ? 'não caiu na fila' : `motivo: ${naFila.docs[0].data().reason}`
);
check('a fila registra qual OS ele citou', !naFila.empty && naFila.docs[0].data().citedTicketId === OS);
check('a mensagem NÃO entra na OS', !(await textosDaOs()).includes('MENSAGEM INJETADA'));

const conversa = (await db.collection('emailThreads').doc(OS).get()).data() || {};
check('o CC da conversa NÃO é trocado', conversa.ccEmail === COPIA_LEGITIMA, `ccEmail: ${conversa.ccEmail}`);
check(
  'o espião NÃO vira participante',
  !(conversa.participants || []).includes(ESPIAO) && !(conversa.participants || []).includes(ATACANTE),
  JSON.stringify(conversa.participants)
);

// ── 2. O SOLICITANTE CONTINUA ENTRANDO ──────────────────────────────────────
await sincronizar(
  mensagem({
    id: 'g-fora-2',
    threadId: 'gthread-solicitante',
    from: `Murilo <${SOLICITANTE}>`,
    messageId: IDS.legitima,
    texto: 'Resposta legítima do solicitante',
  })
);
check('a resposta do solicitante entra na OS', (await textosDaOs()).includes('Resposta legítima do solicitante'));

// ── 2b. NOME DE EXIBIÇÃO NÃO SE PASSA PELO SOLICITANTE ──────────────────────
// Achado do revisor: o endereço era o primeiro texto com arroba, então o NOME
// decidia quem mandou — do próprio domínio do atacante, com SPF/DKIM válidos.
await sincronizar(
  mensagem({
    id: 'g-fora-2b',
    threadId: 'gthread-disfarce',
    from: `"${SOLICITANTE}" <${ATACANTE}>`,
    cc: ESPIAO,
    messageId: IDS.disfarce,
    texto: 'DISFARCE pelo nome de exibição',
  })
);
const disfarce = await db.collection('inboundDropped').where('messageId', '==', IDS.disfarce).get();
check('o e-mail do solicitante no NOME não engana: vai para a fila', !disfarce.empty);
check('e não entra na OS', !(await textosDaOs()).includes('DISFARCE'));

// ── 2c. QUEM ENTRA POR REFERENCES NÃO MEXE NA CÓPIA ─────────────────────────
// Sem número no assunto, citando o Message-ID de uma mensagem legítima: o vínculo
// por thread aceita (não é credencial de estranho, mas vaza por encaminhamento), e
// por isso a cópia da conversa só muda pela mão de quem é da OS.
caixaDeEntrada.length = 0;
caixaDeEntrada.push({
  id: 'g-fora-2c',
  threadId: 'gthread-intruso',
  historyId: '1',
  labelIds: ['INBOX'],
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From', value: `Intruso <${INTRUSO}>` },
      { name: 'To', value: 'os@christus.com.br' },
      { name: 'Cc', value: ESPIAO },
      { name: 'Subject', value: 'Re: Vazamento no bloco B' },
      { name: 'Message-Id', value: IDS.intruso },
      { name: 'In-Reply-To', value: IDS.legitima },
      { name: 'References', value: IDS.legitima },
    ],
    mimeType: 'text/plain',
    body: { data: b64url('Resposta do intruso por References') },
  },
});
await db.collection('config').doc('gmailSync').delete().catch(() => {});
await chamar('gmail-sync', { token: 'segredo-de-teste' });
check(
  'a mensagem por References chega à OS (senão as duas checagens abaixo passariam à toa)',
  (await textosDaOs()).includes('Resposta do intruso por References')
);
const depoisDoIntruso = (await db.collection('emailThreads').where('ticketId', '==', OS).get()).docs.map(d => d.data());
check(
  'quem entra por References NÃO troca a cópia da conversa',
  depoisDoIntruso.every(t => !String(t.ccEmail || '').includes(ESPIAO)),
  JSON.stringify(depoisDoIntruso.map(t => t.ccEmail))
);
check(
  'nem vira participante (que é o que reconheceria depois)',
  depoisDoIntruso.every(t => !(t.participants || []).includes(INTRUSO) && !(t.participants || []).includes(ESPIAO)),
  JSON.stringify(depoisDoIntruso.map(t => t.participants))
);

// ── 2d. QUEM É DA CASA ACRESCENTA À CÓPIA, MAS NÃO TROCA ────────────────────
// Revisão de segurança: "reconhecido" inclui qualquer @christus.com.br. Se ele
// trocasse a cópia, um funcionário de outra unidade redirecionaria a OS inteira.
await sincronizar(
  mensagem({
    id: 'g-fora-2d',
    threadId: 'gthread-colega',
    from: 'Colega <colega@christus.com.br>',
    cc: 'convidado@parceiro.example',
    messageId: IDS.colega,
    texto: 'Mensagem do colega da casa',
  })
);
const copiaDepoisDoColega = String((await db.collection('emailThreads').doc(OS).get()).data()?.ccEmail || '');
check('a mensagem do colega da casa entra na OS', (await textosDaOs()).includes('Mensagem do colega da casa'));
check(
  'o colega ACRESCENTA à cópia sem tirar quem já estava',
  copiaDepoisDoColega.includes(COPIA_LEGITIMA) && copiaDepoisDoColega.includes('convidado@parceiro.example'),
  copiaDepoisDoColega
);

// ── 3. A EQUIPE APROVA O REMETENTE, E ELE PASSA A ENTRAR ────────────────────
const token = await login();
const vinculo = await chamar('dropped-inbound', {
  token,
  body: { id: naFila.docs[0]?.id, action: 'vincular', ticketId: OS },
});
check('a equipe consegue vincular a mensagem da fila à OS', vinculo.status === 200, `status ${vinculo.status}`);

await sincronizar(
  mensagem({
    id: 'g-fora-3',
    threadId: 'gthread-atacante-2',
    from: `Fornecedor <${ATACANTE}>`,
    messageId: IDS.aprovado,
    texto: 'Orçamento enviado pelo remetente aprovado',
  })
);
check(
  'depois de vinculado, o mesmo remetente entra sozinho',
  (await textosDaOs()).includes('Orçamento enviado pelo remetente aprovado')
);

// ── 4. A FILA RESPEITA O TERRITÓRIO DA OS CITADA ────────────────────────────
// Achado do revisor: antes a mensagem ia para a OS e só o território dela via; na
// fila, qualquer Gestor leria o corpo de um e-mail que cita OS de outra unidade.
await db.collection('tickets').doc(OS_SUL).set({
  id: OS_SUL,
  subject: 'Infiltração na quadra',
  status: 'Em andamento',
  requesterEmail: 'diretora.sul@cliente.local',
  sede: 'SUL3',
  siteId: 'sul3',
  regionId: 'regiao-sul',
  createdAt: agora,
  time: agora,
  updatedAt: agora,
  history: [],
});
caixaDeEntrada.length = 0;
caixaDeEntrada.push({
  id: 'g-fora-4',
  threadId: 'gthread-sul',
  historyId: '1',
  labelIds: ['INBOX'],
  internalDate: String(Date.now()),
  payload: {
    headers: [
      { name: 'From', value: 'Estranho <estranho@evil.example>' },
      { name: 'To', value: 'os@christus.com.br' },
      { name: 'Subject', value: `Re: ${OS_SUL} - Infiltração na quadra` },
      { name: 'Message-Id', value: IDS.sul },
    ],
    mimeType: 'text/plain',
    body: { data: b64url('Texto sigiloso de outra unidade') },
  },
});
await db.collection('config').doc('gmailSync').delete().catch(() => {});
await chamar('gmail-sync', { token: 'segredo-de-teste' });

const filaDoAdmin = await chamar('dropped-inbound', { method: 'GET', token });
const doAdmin = (filaDoAdmin.json.items || []).find(item => item.citedTicketId === OS_SUL);
check(
  'o Admin vê a mensagem na fila, com o motivo e a OS citada',
  Boolean(doAdmin) && doAdmin.reason === 'remetente-desconhecido',
  doAdmin ? `motivo: ${doAdmin.reason}` : `status ${filaDoAdmin.status}`
);
const tokenGestor = await login('gestor.e2e@test.local');
const filaDoGestor = await chamar('dropped-inbound', { method: 'GET', token: tokenGestor });
check('o Gestor de outro território consegue ler a fila', filaDoGestor.status === 200, `status ${filaDoGestor.status}`);
check(
  'mas NÃO vê a mensagem que cita OS fora do território dele',
  !(filaDoGestor.json.items || []).some(item => item.citedTicketId === OS_SUL)
);
const descarteDoGestor = await chamar('dropped-inbound', {
  token: tokenGestor,
  body: { id: doAdmin?.id, action: 'descartar' },
});
check('nem consegue descartá-la pelo id', descarteDoGestor.status === 403, `status ${descarteDoGestor.status}`);
const criarDoGestor = await chamar('dropped-inbound', {
  token: tokenGestor,
  body: { id: doAdmin?.id, action: 'criar', sede: 'PQL3' },
});
check('nem virar OS na sede dele', criarDoGestor.status === 403, `status ${criarDoGestor.status}`);

await limpar();
const falhas = results.filter(r => !r.pass).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas > 0 ? 1 : 0);
