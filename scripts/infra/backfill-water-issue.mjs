/**
 * Marca como problema de água as OS antigas cujo ASSUNTO já dizia isso.
 *
 * Por que existe: a marcação dependia de alguém clicar uma caixinha na triagem, e o
 * detector antigo só conhecia "goteira" e "infiltração". Resultado medido nas 270 OS
 * de produção: 13 OS falavam de vazamento, calha, telhado ou impermeabilização no
 * assunto e estavam sem sinal nenhum — inclusive "Vazamento no teto do Hall do 4º
 * andar".
 *
 * Só ACRESCENTA marcação. Nunca desmarca: se alguém marcou à mão algo que o detector
 * não vê (o corpo do e-mail dizia o que o assunto não disse), quem sabe mais é a
 * pessoa.
 *
 *   node scripts/infra/backfill-water-issue.mjs             # dry-run (padrão)
 *   node scripts/infra/backfill-water-issue.mjs --apply     # grava
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { hasWaterIssueSignal } from '../../api/_lib/inboundBody.js';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');

const credenciais = readServiceAccount(resolveCredentialsPath());
initializeApp({ credential: cert(credenciais) });
const db = getFirestore();

const snap = await db.collection('tickets').get();
const alvos = [];
snap.forEach(doc => {
  const t = doc.data();
  if (t.waterIssue) return;
  if (!hasWaterIssueSignal(t.subject)) return;
  alvos.push({ ref: doc.ref, id: doc.id, subject: t.subject });
});

console.log(`OS analisadas: ${snap.size}`);
console.log(`OS a marcar como água: ${alvos.length}`);
for (const a of alvos) console.log(`  ${a.id}  ${String(a.subject).slice(0, 64)}`);

if (!APLICAR) {
  console.log('\nDRY-RUN — nada foi gravado. Rode com --apply para valer.');
  process.exit(0);
}

let gravadas = 0;
for (const a of alvos) {
  // `waterIssue` é o único campo tocado. Sem histórico e sem e-mail: é correção de
  // metadado, não evento da OS — poluir a conversa de 13 OS com "o sistema marcou uma
  // caixinha" seria pior que o problema.
  await a.ref.update({ waterIssue: true, updatedAt: new Date() });
  gravadas += 1;
}
console.log(`\nMarcadas: ${gravadas}`);
