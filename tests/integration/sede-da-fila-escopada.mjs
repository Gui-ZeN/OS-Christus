/**
 * A SEDE DE DESTINO DA FILA DE MENSAGENS SOLTAS RESPEITA O TERRITÓRIO.
 *
 * Medido em produção em 09/09/2026: o seletor de sede da fila recebia
 * `catalogSites` inteiro — as 23 sedes do catálogo — para QUALQUER Gestor. A Thais
 * tem acesso a 6. Não era só ruído: criar a OS numa sede fora do território fazia a
 * OS nascer e sair da vista de quem a criou no mesmo instante, porque toda leitura
 * de OS passa por `canUserAccessTicket`.
 *
 * ⚠️ O QUE ESTE TESTE PROTEGE É A RECUSA, não o seletor. Esconder a sede da lista é
 * conforto de tela e não vale como controle: bastava forjar o corpo do POST. Por
 * isso a segunda verificação é um POST direto numa sede proibida.
 *
 * ⚠️ E A FILA CONTINUA SEM ESCOPO — isso é de propósito. Mensagem que ainda não virou
 * OS não tem território, e quem tria precisa ver o que chegou na caixa da operação.
 * O que ganhou escopo é para ONDE ela pode ir.
 *
 * Pré-requisitos: emulador (auth 9099 + firestore 8080) e `npm run dev:seed`.
 * O Gestor semeado tem regionIds ['universidade'] e siteIds ['pql3'] — escopo
 * explícito por sede, então só PQL3 vale, mesmo a região tendo DL e PE.
 */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_PROJECT_ID ||= 'os-christus';
process.env.GMAIL_CLIENT_ID = 'dummy-id';
process.env.GMAIL_CLIENT_SECRET = 'dummy-secret';
process.env.GMAIL_REFRESH_TOKEN = 'dummy-refresh';
process.env.GMAIL_FROM_EMAIL = 'os@christus.com.br';
process.env.TICKET_NOTIFICATION_EMAIL = 'os@christus.com.br';
process.env.APP_BASE_URL = 'http://localhost:3000';

import { google } from 'googleapis';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

google.gmail = () => ({
  users: {
    getProfile: async () => ({ data: { emailAddress: 'os@christus.com.br' } }),
    messages: {
      send: async () => ({ data: { id: 'ignorado', threadId: 'ignorado' } }),
      list: async () => ({ data: { messages: [] } }),
      attachments: { get: async () => ({ data: { data: '' } }) },
    },
  },
});

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const { default: handler } = await import('../../api/mail.js');

const DROP = 'drop-escopo-01';

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

async function login(email) {
  const r = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test@123456', returnSecureToken: true }),
    }
  );
  const j = await r.json();
  if (!j.idToken) throw new Error(`sem idToken para ${email}: ${JSON.stringify(j)}`);
  return j.idToken;
}

await db.collection('inboundDropped').doc(DROP).delete().catch(() => {});
await db.collection('inboundDropped').doc(DROP).set({
  fromEmail: 'alguem@cliente.local',
  subject: 'Portão da garagem travado',
  text: 'O portão não abre desde ontem.',
  messageId: '<escopo-01@cliente.local>',
  threadId: 'gthread-escopo-01',
  reason: 'sem-sede-e-sem-vinculo',
  status: 'pendente',
  attachmentCount: 0,
  attachments: [],
  receivedAt: new Date(),
  createdAt: new Date(),
});

const tokenGestor = await login('gestor.e2e@test.local');
const tokenAdmin = await login('admin@test.local');

// ── 1. o seletor oferece só o que é dela ────────────────────────────────────
const filaDoGestor = await chamar('dropped-inbound', { method: 'GET', token: tokenGestor });
const sedesDoGestor = filaDoGestor.json?.sedes || [];
check(
  'o Gestor recebe SÓ as sedes do território dele',
  sedesDoGestor.length === 1 && sedesDoGestor[0] === 'PQL3',
  `recebeu ${JSON.stringify(sedesDoGestor)}`
);

const filaDoAdmin = await chamar('dropped-inbound', { method: 'GET', token: tokenAdmin });
const sedesDoAdmin = filaDoAdmin.json?.sedes || [];
check(
  'o Admin continua recebendo o catálogo inteiro',
  sedesDoAdmin.length >= 4 && sedesDoAdmin.includes('SUL3'),
  `recebeu ${JSON.stringify(sedesDoAdmin)}`
);

// ── 2. A TRAVA: o POST direto numa sede proibida é recusado ──────────────────
// Esconder do seletor não é controle. Este é.
const forjado = await chamar('dropped-inbound', {
  token: tokenGestor,
  body: { id: DROP, action: 'criar', sede: 'SUL3' },
});
check(
  'criar OS em sede fora do território é recusado com 403',
  forjado.status === 403,
  `HTTP ${forjado.status} — ${forjado.json?.error || ''}`
);

const naoNasceu = (await db.collection('inboundDropped').doc(DROP).get()).data();
check(
  'e a mensagem continua na fila, não foi consumida pela tentativa',
  naoNasceu?.status === 'pendente',
  `status ${naoNasceu?.status}`
);

// ── 3. dentro do território continua funcionando ────────────────────────────
const permitido = await chamar('dropped-inbound', {
  token: tokenGestor,
  body: { id: DROP, action: 'criar', sede: 'PQL3' },
});
check(
  'criar OS na própria sede continua funcionando',
  permitido.status === 201 && Boolean(permitido.json?.ticketId),
  `HTTP ${permitido.status} — ${permitido.json?.error || permitido.json?.ticketId || ''}`
);

/**
 * ⚠️ A LIMPEZA INCLUI A OUTBOX, e isso não é zelo — é correção de um defeito que
 * este teste causou. Criar OS pelo caminho de verdade ENFILEIRA o aviso ao gestor
 * (`{id}__mgrnotify`). Deixado para trás, ele entra no lote de `outbox-starvation`,
 * que seleciona 5 itens prontos: o item órfão ocupa uma vaga e aquele teste reprova
 * com "encontrados=4 de 5" — vermelho num arquivo que não tem nada a ver com este.
 */
if (permitido.json?.ticketId) {
  const criada = permitido.json.ticketId;
  await db.collection('tickets').doc(criada).delete().catch(() => {});
  for (const d of (await db.collection('emailOutbox').where('ticketId', '==', criada).get()).docs) {
    await d.ref.delete();
  }
}
await db.collection('inboundDropped').doc(DROP).delete().catch(() => {});

const falhas = results.filter(r => !r.pass).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas > 0 ? 1 : 0);
