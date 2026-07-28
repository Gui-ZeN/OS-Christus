import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { selectEligibleEmailOutbox } from '../../api/_lib/emailOutboxWorker.js';

/**
 * Regressão do P2 "starvation da outbox" (4ª auditoria), contra o Firestore.
 *
 * O unitário cobre a lógica com um mock paginado; este cobre o que o mock NÃO
 * pode garantir: que `startAfter(doc)` combinado com `where('status','in',[...])`
 * pagina de verdade na API do Firestore, sem índice composto — a query já usava
 * `where in` + `limit` com a mesma ordenação implícita por documentId, então o
 * cursor não muda o índice necessário. Este teste é o que prova isso.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const PREFIX = 'outbox-starv-';
const BACKOFF = 120;
const PRONTOS = 5;

async function limpar() {
  const snap = await db.collection('emailOutbox').get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + 400)) {
      if (doc.id.startsWith(PREFIX)) batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function semear(now) {
  const futuro = new Date(now.getTime() + 60 * 60 * 1000);
  // Ids "a-" vêm ANTES de "z-" na ordenação por documentId — que é exatamente a
  // ordem em que o Firestore devolvia, e por isso os prontos nunca eram vistos.
  const docs = [
    ...Array.from({ length: BACKOFF }, (_, i) => ({
      id: `${PREFIX}a-backoff-${String(i).padStart(3, '0')}`,
      data: {
        ticketId: `OS-STARV-B${i}`,
        commandKey: `starv_backoff_${i}`,
        type: 'finance_payment',
        status: 'failed',
        attempts: 1,
        nextAttemptAt: futuro,
      },
    })),
    ...Array.from({ length: PRONTOS }, (_, i) => ({
      id: `${PREFIX}z-pronto-${String(i).padStart(3, '0')}`,
      data: {
        ticketId: `OS-STARV-P${i}`,
        commandKey: `starv_pronto_${i}`,
        type: 'finance_payment',
        status: 'pending',
        attempts: 0,
      },
    })),
  ];
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const item of docs.slice(i, i + 400)) {
      batch.set(db.collection('emailOutbox').doc(item.id), item.data);
    }
    await batch.commit();
  }
}

async function main() {
  const now = new Date();
  await limpar();
  await semear(now);

  const result = await selectEligibleEmailOutbox(db, { now, batchSize: 5 });
  const encontrados = result.eligible.filter(item => item.outboxKey.startsWith('starv_pronto_'));

  check(
    'a query paginada não estoura (startAfter + where in funcionam juntos)',
    Array.isArray(result.eligible),
    `eligible=${result.eligible.length} scanned=${result.scanned}`
  );
  check(
    `encontra os ${PRONTOS} prontos atrás de ${BACKOFF} em backoff`,
    encontrados.length === PRONTOS,
    `encontrados=${encontrados.length} de ${PRONTOS}`
  );
  check(
    'precisou de mais de uma página para chegar neles',
    result.scanned > 100,
    `scanned=${result.scanned}`
  );
  check(
    'nenhum item em backoff foi selecionado por engano',
    result.eligible.every(item => !item.outboxKey.startsWith('starv_backoff_')),
    result.eligible.map(item => item.outboxKey).join(',')
  );
  check(
    'nada foi marcado dead-letter (ninguém estourou tentativas)',
    result.deadLettered === 0,
    `deadLettered=${result.deadLettered}`
  );

  await limpar();

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('FALHOU  erro inesperado —', error);
  process.exit(1);
});
