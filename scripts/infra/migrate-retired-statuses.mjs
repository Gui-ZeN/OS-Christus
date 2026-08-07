/**
 * Tira as OS presas nas etapas de aprovação da diretoria.
 *
 * As três etapas (`Aguardando Aprovação da Solução`, `do Orçamento`, `do contrato`)
 * saíram do fluxo: não havia nenhum Diretor cadastrado, e a aprovação real acontece
 * por e-mail. O servidor passou a RECUSAR entrada nelas — mas quem já estava dentro
 * continua dentro até alguém mover.
 *
 * Destino: "Em andamento", decidido pelo dono do produto. As duas OS afetadas têm
 * conversa e trabalho reais; devolvê-las à fila de triagem apagaria o que já andou.
 *
 * Escreve no histórico o que fez e por quê: mudança de etapa sem explicação, feita
 * por script, é exatamente o tipo de coisa que ninguém entende seis meses depois.
 *
 *   node scripts/infra/migrate-retired-statuses.mjs           # dry-run (padrão)
 *   node scripts/infra/migrate-retired-statuses.mjs --apply   # grava
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { appendTicketHistory } from '../../api/_lib/tickets.js';
import { isRetiredStatus } from '../../api/_lib/statusFlow.js';
import { recomputeOperationalAttention } from '../../api/_lib/operationalAttention.js';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');
const DESTINO = 'Em andamento';

initializeApp({ credential: cert(readServiceAccount(resolveCredentialsPath())) });
const db = getFirestore();

const snap = await db.collection('tickets').get();
const presas = [];
snap.forEach(doc => {
  const t = doc.data();
  if (isRetiredStatus(t.status)) presas.push({ ref: doc.ref, id: doc.id, status: t.status, subject: t.subject });
});

console.log(`OS analisadas: ${snap.size}`);
console.log(`presas em etapa aposentada: ${presas.length}`);
for (const p of presas) console.log(`  ${p.id}  ${p.status}  →  ${DESTINO}   ${String(p.subject).slice(0, 46)}`);

if (!APLICAR) {
  console.log('\nDRY-RUN — nada foi gravado. Rode com --apply para valer.');
  process.exit(0);
}

const agora = new Date();
for (const p of presas) {
  await appendTicketHistory(db, p.ref, [{
    id: `migracao-etapa-${p.id}`,
    type: 'system',
    sender: 'Sistema',
    time: agora,
    text: `Etapa alterada de "${p.status}" para "${DESTINO}": a aprovação da diretoria saiu do fluxo (nenhum diretor cadastrado; a autorização passou a ser registrada a partir do e-mail).`,
    visibility: 'internal',
  }]);
  await p.ref.update({ status: DESTINO, updatedAt: agora });
  // A etapa alimenta a projeção: sem recalcular, a atenção ficaria como estava.
  await recomputeOperationalAttention(db, p.id);
  console.log(`movida: ${p.id}`);
}
console.log(`\nMovidas: ${presas.length}`);
