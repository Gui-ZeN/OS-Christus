/**
 * A DATA EM QUE A OS ENTROU NA ETAPA, INFORMADA — contra o PATCH de produção.
 *
 * 16/10/2026: a data da etapa era sempre o clique, e a data real da conclusão ia para
 * a observação. Agora a tela manda `statusDate` e o servidor confere e carimba em
 * `stageEnteredAt`, `closedAt` e no marco da etapa. Este teste afirma o que fica
 * GRAVADO, não o que a resposta diz.
 *
 * Pré-requisitos: emulador (auth 9099 + firestore 8080) e `npm run dev:seed`.
 */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_PROJECT_ID ||= 'os-christus';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const { default: handler } = await import('../../api/tickets.js');

const OS = 'OS-99081';
const FUSO = 3 * 60 * 60 * 1000;
const dia = deslocamento => new Date(Date.now() - FUSO + deslocamento * 86_400_000).toISOString().slice(0, 10);
const diaDe = valor => (valor?.toDate ? valor.toDate() : valor ? new Date(valor) : null);
const emFortaleza = d => (d ? new Date(d.getTime() - FUSO).toISOString().slice(0, 10) : null);

async function login(email = 'admin@test.local') {
  const r = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Test@123456', returnSecureToken: true }) }
  );
  const j = await r.json();
  if (!j.idToken) throw new Error(`sem idToken: ${JSON.stringify(j)}`);
  return j.idToken;
}

function patch(token, body) {
  const req = { method: 'PATCH', query: {}, headers: { authorization: `Bearer ${token}` }, body };
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

const ler = async () => (await db.collection('tickets').doc(OS).get()).data();

async function limpar() {
  for (const d of (await db.collection('tickets').doc(OS).collection('historyEntries').get()).docs) await d.ref.delete();
  await db.collection('tickets').doc(OS).delete().catch(() => {});
  for (const col of ['emailOutbox', 'emailEvents', 'auditLogs']) {
    for (const d of (await db.collection(col).where('ticketId', '==', OS).get()).docs) await d.ref.delete();
  }
}

await limpar();
const abertaEm = new Date(`${dia(-10)}T09:00:00-03:00`);
await db.collection('tickets').doc(OS).set({
  id: OS,
  subject: 'Teste da data da etapa',
  status: 'Nova OS',
  requester: 'Teste',
  requesterEmail: 'teste@cliente.local',
  sede: 'PQL3',
  siteId: 'pql3',
  regionId: 'universidade',
  macroServiceId: 'm',
  serviceCatalogId: 's',
  // Registrada HOJE com a data da OS retroativa (`time`) — o caso de registrar
  // atrasado. O limite tem que ser `time`, o que a tela mostra (auditor, 16/10).
  createdAt: new Date(),
  time: abertaEm,
  updatedAt: abertaEm,
  stageEnteredAt: abertaEm,
  marcos: { 'Nova OS': abertaEm },
  history: [],
});
const token = await login();

// 1. Triagem registrada atrasada: entrou em análise há 7 dias.
let r = await patch(token, { id: OS, updates: { status: 'Aguardando Parecer Técnico' }, statusDate: dia(-7) });
let t = await ler();
check('aceita a mudança com data passada', r.status === 200, `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
check('stageEnteredAt é o dia informado', emFortaleza(diaDe(t.stageEnteredAt)) === dia(-7), emFortaleza(diaDe(t.stageEnteredAt)));
check('o marco da etapa é o dia informado', emFortaleza(diaDe(t.marcos?.['Aguardando Parecer Técnico'])) === dia(-7));

// 2. Futuro: recusado, e nada muda.
r = await patch(token, { id: OS, updates: { status: 'Em andamento' }, statusDate: dia(1) });
t = await ler();
check('data no futuro é recusada com 400', r.status === 400, `HTTP ${r.status} ${r.json?.error || ''}`);
check('e a etapa não muda', t.status === 'Aguardando Parecer Técnico', t.status);

// 3. Antes da abertura: recusado.
r = await patch(token, { id: OS, updates: { status: 'Em andamento' }, statusDate: dia(-11) });
check('data anterior à abertura é recusada com 400', r.status === 400, `HTTP ${r.status} ${r.json?.error || ''}`);

// 3b. TRAVA (decisão do dono, 16/10): antes da entrada na etapa atual, não — o tempo
// por etapa sairia negativo. A OS entrou na etapa atual em dia(-7).
r = await patch(token, { id: OS, updates: { status: 'Encerrada' }, statusDate: dia(-8) });
t = await ler();
check('data anterior à entrada na etapa atual é recusada com 400', r.status === 400, `HTTP ${r.status} ${r.json?.error || ''}`);
check('e a OS continua aberta', t.status === 'Aguardando Parecer Técnico', t.status);

// 4. Conclusão registrada atrasada: a data vira o closedAt (o que os indicadores leem).
r = await patch(token, { id: OS, updates: { status: 'Encerrada' }, statusDate: dia(-2) });
t = await ler();
check('encerra com a data informada', r.status === 200 && t.status === 'Encerrada', `HTTP ${r.status}`);
check('closedAt é o dia da conclusão informada', emFortaleza(diaDe(t.closedAt)) === dia(-2), emFortaleza(diaDe(t.closedAt)));
const registro = (Date.now() - diaDe(t.closedRegisteredAt).getTime()) / 1000;
check('o registro do encerramento é AGORA (o prazo do link conta daqui)', registro >= 0 && registro < 60, `${registro.toFixed(1)}s`);

// 5. Sem data: continua valendo o clique (tela antiga não quebra).
r = await patch(token, { id: OS, updates: { status: 'Aguardando Parecer Técnico' } });
t = await ler();
const segundos = (Date.now() - diaDe(t.stageEnteredAt).getTime()) / 1000;
check('sem statusDate vale o clique', r.status === 200 && segundos >= 0 && segundos < 60, `${segundos.toFixed(1)}s atrás`);
check('reabrir limpa o closedAt e o registro', !t.closedAt && !t.closedRegisteredAt);

// 6. Encerrou por engano HOJE. A trava impede encerrar de novo com data anterior sem
// antes reabrir; a correção é REABRIR informando a data real (reabrir não trava pela
// etapa atual) e encerrar com a data real. O marco acompanha.
r = await patch(token, { id: OS, updates: { status: 'Encerrada' } });
check('encerramento por engano, hoje', r.status === 200, `HTTP ${r.status}`);
r = await patch(token, { id: OS, updates: { status: 'Aguardando Parecer Técnico' }, statusDate: dia(-3) });
check('reabrir com data anterior ao encerramento errado é aceito', r.status === 200, `HTTP ${r.status} ${r.json?.error || ''}`);
r = await patch(token, { id: OS, updates: { status: 'Encerrada' }, statusDate: dia(-1) });
t = await ler();
check(
  'reentrar com data informada sobrescreve o marco — closedAt e linha do tempo concordam',
  emFortaleza(diaDe(t.marcos?.Encerrada)) === dia(-1) && emFortaleza(diaDe(t.closedAt)) === dia(-1),
  `marco=${emFortaleza(diaDe(t.marcos?.Encerrada))} closedAt=${emFortaleza(diaDe(t.closedAt))}`
);

await limpar();
const falhas = results.filter(item => !item.pass).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas > 0 ? 1 : 0);
