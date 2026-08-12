import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { processEmailOutboxBatch } from '../../api/_lib/emailOutboxWorker.js';

/**
 * O DEFEITO QUE DEIXOU 85 AVISOS PARADOS POR 15 DIAS, contra o Firestore de verdade.
 *
 * Quando o despacho falhava, `processEmailOutboxBatch` devolvia `failed: N` no corpo
 * da resposta e NÃO tocava no documento. `attempts` ficava em 0, `status` em
 * `pending`, e o item era retentado a cada execução — idêntico depois de cada uma.
 * O workflow do Actions recebia HTTP 200 e ficava verde: 277 execuções bem-sucedidas
 * enquanto nenhum e-mail saía.
 *
 * O retry/backoff/dead-letter existia e era testado, mas nunca engatava: tudo nele
 * depende de campos que só a OUTRA ponta (`?route=send`, depois do claim) escrevia.
 *
 * Este teste é de integração e não unitário porque o que importa é a transação real:
 * a gravação condicional que se recusa a sobrescrever item em voo.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const PREFIX = 'outbox-desp-';

async function limpar() {
  const snap = await db.collection('emailOutbox').get();
  const batch = db.batch();
  let n = 0;
  for (const doc of snap.docs) {
    if (doc.id.startsWith(PREFIX)) { batch.delete(doc.ref); n += 1; }
  }
  if (n) await batch.commit();
}

async function semear(id, extra = {}) {
  await db.collection('emailOutbox').doc(id).set({
    id: id.replace(PREFIX, ''),
    commandKey: id.replace(PREFIX, ''),
    ticketId: 'OS-DESP-1',
    type: 'ticket.manager-notification',
    recipients: ['gestor@test.local'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  });
}

await limpar();

// --- 1. Falha de despacho fica GRAVADA no documento -------------------------------
const idFalha = `${PREFIX}falha`;
await semear(idFalha);

const r1 = await processEmailOutboxBatch({
  db,
  dispatch: async () => { throw new Error('URL interna do Serv3 não configurada'); },
  batchSize: 5,
});

const depois = (await db.collection('emailOutbox').doc(idFalha).get()).data();
check('o worker relata a falha', r1.failed === 1, `failed=${r1.failed}`);
check('attempts sai de 0', Number(depois.attempts) === 1, `attempts=${depois.attempts}`);
check('status deixa de ser pending', depois.status === 'failed', `status=${depois.status}`);
check('o motivo fica no dado', /URL interna/.test(String(depois.lastError || '')), depois.lastError);
check('o retry é agendado', Boolean(depois.nextAttemptAt), String(depois.nextAttemptAt?.toDate?.() || ''));

// --- 2. Item EM VOO não é sobrescrito ---------------------------------------------
// Se a outra ponta reivindicou (lease), é ela quem registra o desfecho. Sobrescrever
// aqui marcaria como falho um e-mail que pode ter sido entregue.
const idEmVoo = `${PREFIX}emvoo`;
await semear(idEmVoo, { leaseToken: 'token-de-alguem', leaseAt: new Date(), attempts: 2 });

await processEmailOutboxBatch({
  db,
  dispatch: async () => { throw new Error('timeout'); },
  batchSize: 5,
});

const emVoo = (await db.collection('emailOutbox').doc(idEmVoo).get()).data();
check(
  'item com lease ativa fica intacto',
  Number(emVoo.attempts) === 2 && !emVoo.lastError,
  `attempts=${emVoo.attempts} lastError=${emVoo.lastError || '(vazio)'}`
);

// --- 3. Na última tentativa vira dead-letter COM alerta ---------------------------
const idUltima = `${PREFIX}ultima`;
await semear(idUltima, { attempts: 5 });

await processEmailOutboxBatch({
  db,
  dispatch: async () => { throw new Error('falhou de novo'); },
  batchSize: 5,
});

const morto = (await db.collection('emailOutbox').doc(idUltima).get()).data();
const alerta = await db.collection('notifications').doc(`outbox-${idUltima}`).get();
check('esgotado vira dead-letter', morto.status === 'dead-letter', `status=${morto.status}`);
check('e alguém é avisado', alerta.exists, alerta.exists ? alerta.data().title : 'sem notificação');

// --- 4. OS apagada encerra o item, SEM alarme ------------------------------------
// A coordenadora pediu a exclusao das OS da universidade e 105 sairam do banco; 22
// avisos enfileirados passaram a apontar para o vazio. Retentar seis vezes e alarmar
// seria transformar uma exclusao deliberada em 22 incidentes.
const idSemOs = `${PREFIX}semos`;
await semear(idSemOs);

await processEmailOutboxBatch({
  db,
  dispatch: async () => ({ ok: true, skipped: 'ticket-inexistente' }),
  batchSize: 5,
});

const obsoleto = (await db.collection('emailOutbox').doc(idSemOs).get()).data();
const alertaObsoleto = await db.collection('notifications').doc(`outbox-${idSemOs}`).get();
check('sai da fila', obsoleto.status === 'dead-letter', `status=${obsoleto.status}`);
check('fica marcado como obsoleto', obsoleto.obsolete === true, `obsolete=${obsoleto.obsolete}`);
check('o motivo fica legivel', /nao existe|não existe/i.test(String(obsoleto.lastError || '')), obsoleto.lastError);
check('NAO acorda ninguem', !alertaObsoleto.exists, alertaObsoleto.exists ? 'criou alerta' : 'sem alerta');

await limpar();

const falhas = results.filter(r => !r.pass).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram.`);
process.exit(falhas ? 1 : 0);
