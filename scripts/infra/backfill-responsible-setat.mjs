/**
 * Recupera `responsible.setAt` das OS que ganharam responsável ANTES do campo existir.
 *
 * Contexto: o campo de responsável subiu ontem e a operação começou a usar no mesmo
 * dia — 37 OS já tinham responsável quando `setAt` passou a ser gravado. Sem a data,
 * a regra "com responsável e sem progresso" usa a última movimentação como relógio,
 * e cobraria HOJE quem assumiu HOJE uma OS parada há 39 dias. Punir exatamente quem
 * acabou de fazer a coisa certa é o pior comportamento possível para uma regra nova.
 *
 * De onde vem a data: da entrada de histórico que o próprio sistema escreveu ao
 * atribuir ("Responsável pela OS: Fulano"). É o único lugar onde ela existe.
 *
 * ⚠️ Isto LÊ TEXTO do histórico, coisa que as regras não fazem de propósito. Aqui é
 * aceitável e é diferente: script de uma vez só, sobre entradas que o sistema mesmo
 * escreveu num formato que ele controla — não interpretação de texto de gente. Se
 * não encontrar a entrada, NÃO inventa: deixa sem `setAt` e reporta.
 *
 *   node scripts/infra/backfill-responsible-setat.mjs           # ensaio (padrão)
 *   node scripts/infra/backfill-responsible-setat.mjs --apply   # grava
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');
const MARCADOR = /Responsável pela OS:/i;

initializeApp({ credential: cert(readServiceAccount(resolveCredentialsPath())) });
const db = getFirestore();

const paraData = valor => valor?.toDate?.() || (valor ? new Date(valor) : null);

const snap = await db.collection('tickets').get();
const alvos = snap.docs.filter(doc => {
  const t = doc.data();
  return t.responsible?.email && !t.responsible?.setAt;
});

console.log(`OS analisadas: ${snap.size}`);
console.log(`com responsável e sem setAt: ${alvos.length}`);

const achados = [];
const semData = [];
for (const doc of alvos) {
  const t = doc.data();
  const embutido = Array.isArray(t.history) ? t.history : [];
  const sub = await doc.ref.collection('history').get();
  const todas = [...embutido, ...sub.docs.map(d => d.data())];
  const entrada = todas
    .filter(e => e?.type === 'system' && MARCADOR.test(String(e.text || '')))
    .sort((a, b) => (paraData(b.time)?.getTime() || 0) - (paraData(a.time)?.getTime() || 0))[0];
  const setAt = paraData(entrada?.time);
  if (setAt) achados.push({ ref: doc.ref, id: doc.id, setAt, quem: t.responsible.name });
  else semData.push(doc.id);
}

console.log(`\ncom data recuperada: ${achados.length}`);
for (const a of achados.slice(0, 8)) {
  console.log(`  ${a.id}  ${a.setAt.toISOString().slice(0, 16)}  ${a.quem}`);
}
if (achados.length > 8) console.log(`  … e mais ${achados.length - 8}`);
if (semData.length > 0) {
  console.log(`\nSEM entrada de atribuição no histórico (ficam sem setAt): ${semData.length}`);
  console.log(`  ${semData.join(', ')}`);
}

if (!APLICAR) {
  console.log('\nENSAIO — nada foi gravado. Rode com --apply para valer.');
  process.exit(0);
}

for (const a of achados) {
  // `update` com caminho aninhado: não reescreve email/name, só acrescenta a data.
  await a.ref.update({ 'responsible.setAt': a.setAt, updatedAt: new Date() });
  console.log(`gravado: ${a.id}`);
}
console.log(`\nGravadas: ${achados.length}`);
