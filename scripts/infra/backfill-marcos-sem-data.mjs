/**
 * OS MARCOS QUE ACONTECERAM ANTES DE O SISTEMA PASSAR A OLHAR.
 *
 * A regra nova (`aplicarMarcosSemData`) roda em toda transição — mas OS encerrada não
 * transiciona mais. Sem este passo, as 108 encerradas de hoje continuariam mostrando
 * "2 de 6" para sempre, que é exatamente o caso que motivou o recurso.
 *
 * ⚠️ ISTO AFIRMA QUE O TRABALHO ACONTECEU. A afirmação é do dono do produto: *"a
 * pessoa já fez isso tudo, só não tem a data"*. Ela se apoia na planilha da
 * coordenação, que registra 226 aprovações de solução, 177 orçamentos e 141 ações
 * preliminares — contra 4, 4 e 5 datas dentro do Serv3, em 220 OS.
 *
 * O que o script escreve é DERIVADO da etapa atual, nunca de palpite: marca só os
 * marcos que ficam ATRÁS de onde a OS está. Uma OS parada em triagem não ganha nada.
 *
 * NÃO escreve histórico, de propósito: seriam 136 entradas dizendo a mesma frase numa
 * conversa que a coordenação lê de verdade. E é reversível — o campo `marcosSemData`
 * mora fora de `marcos`, então apagá-lo devolve a OS ao estado de hoje sem perder uma
 * data sequer.
 *
 *   node scripts/infra/backfill-marcos-sem-data.mjs           # ensaio (padrão)
 *   node scripts/infra/backfill-marcos-sem-data.mjs --apply   # grava
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { aplicarMarcosSemData } from '../../api/_lib/statusFlow.js';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');

const conta = readServiceAccount(resolveCredentialsPath());
initializeApp({ credential: cert(conta), projectId: conta.project_id });
const db = getFirestore();
console.log(`projeto: ${conta.project_id}   modo: ${APLICAR ? 'GRAVANDO' : 'ensaio'}\n`);

const snap = await db.collection('tickets').get();
const alvos = [];
const porEtapa = new Map();

snap.forEach(doc => {
  const t = doc.data() || {};
  const semData = aplicarMarcosSemData(t.marcos, t.marcosSemData, t.status);
  if (!semData) return;
  alvos.push({ ref: doc.ref, id: doc.id, status: String(t.status), semData });
  const chave = String(t.status);
  porEtapa.set(chave, (porEtapa.get(chave) || 0) + 1);
});

console.log(`OS na base: ${snap.size}`);
console.log(`OS que ganham marcos "sem data": ${alvos.length}\n`);

console.log('POR ETAPA ATUAL:');
for (const [etapa, quantas] of [...porEtapa].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(quantas).padStart(4)}  ${etapa}`);
}

const porQuantidade = new Map();
for (const a of alvos) porQuantidade.set(a.semData.length, (porQuantidade.get(a.semData.length) || 0) + 1);
console.log('\nQUANTOS MARCOS CADA UMA GANHA:');
for (const n of [...porQuantidade.keys()].sort((a, b) => a - b)) {
  console.log(`  ${n} marco(s)  ${String(porQuantidade.get(n)).padStart(4)} OS`);
}

console.log('\nPRIMEIRAS 10, PARA CONFERIR:');
for (const a of alvos.slice(0, 10)) {
  console.log(`  ${a.id}  [${a.status}]  →  ${a.semData.join(' · ')}`);
}

if (!APLICAR) {
  console.log('\nENSAIO — nada foi gravado. Rode com --apply para valer.');
  process.exit(0);
}

// Lotes de 400: o limite do batch do Firestore é 500.
let gravadas = 0;
for (let i = 0; i < alvos.length; i += 400) {
  const lote = db.batch();
  for (const a of alvos.slice(i, i + 400)) lote.update(a.ref, { marcosSemData: a.semData });
  await lote.commit();
  gravadas += Math.min(400, alvos.length - i);
  console.log(`  gravadas ${gravadas}/${alvos.length}`);
}
console.log(`\nPronto: ${gravadas} OS atualizadas.`);
