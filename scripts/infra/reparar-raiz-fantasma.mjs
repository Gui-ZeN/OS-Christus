/**
 * TROCA A RAIZ FANTASMA PELO PRIMEIRO Message-Id QUE DE FATO SAIU.
 *
 * O defeito: até 25/08, uma OS aberta pela WEB gravava em `rootMessageId` um id
 * fabricado — `<os-thread-os-0100@serv3>` — quando a thread ainda não tinha raiz.
 * Esse id NUNCA saiu como `Message-Id` de nada (quem gera o real é o Gmail, no
 * envio), mas ficava gravado e virava o `In-Reply-To` de TODA resposta seguinte.
 *
 * Referência para mensagem inexistente não encadeia e não dá erro: o cliente
 * simplesmente não agrupa. Por isso passou meses invisível.
 *
 * O conserto no código impede raiz fantasma NOVA. Este script cura as antigas — sem
 * ele, quem já tem a raiz gravada continua citando um fantasma para sempre, porque
 * `storedRootMessageId` ganha de tudo no `handleSend`.
 *
 * ⚠️ DE ONDE VEM A RAIZ VERDADEIRA. Do próprio doc da thread: `references` guarda a
 * corrente em ordem, e o primeiro item que NÃO é fantasma é a primeira mensagem
 * real da conversa. Se não houver nenhum, sobra `lastMessageId` — pior âncora, mas
 * existe de verdade, que é o que importa.
 *
 * ⚠️ NÃO INVENTA. Thread sem nenhum id real fica como está e é reportada. Raiz
 * fantasma agrupa mal; raiz inventada de novo seria o mesmo defeito com outro nome.
 *
 *   node scripts/infra/reparar-raiz-fantasma.mjs           # ensaio (padrão)
 *   node scripts/infra/reparar-raiz-fantasma.mjs --apply   # grava
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');

/** O formato que `buildThreadRootMessageId` produzia, e só ele. */
const FANTASMA = /^<os-thread-[a-z0-9_-]*@serv3>$/i;

const ehFantasma = valor => FANTASMA.test(String(valor || '').trim());

function raizVerdadeira(thread) {
  const referencias = Array.isArray(thread?.references) ? thread.references : [];
  const primeiraReal = referencias.map(r => String(r || '').trim()).find(r => r && !ehFantasma(r));
  if (primeiraReal) return { id: primeiraReal, origem: 'references' };

  const ultima = String(thread?.lastMessageId || '').trim();
  if (ultima && !ehFantasma(ultima)) return { id: ultima, origem: 'lastMessageId' };

  return null;
}

const serviceAccount = readServiceAccount(resolveCredentialsPath());
initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
const db = getFirestore();

const snap = await db.collection('emailThreads').get();

const afetadas = [];
const semCura = [];

for (const doc of snap.docs) {
  const thread = doc.data() || {};
  if (!ehFantasma(thread.rootMessageId)) continue;

  const cura = raizVerdadeira(thread);
  if (!cura) {
    semCura.push({ id: doc.id, raiz: thread.rootMessageId, refs: (thread.references || []).length });
    continue;
  }
  afetadas.push({ id: doc.id, de: thread.rootMessageId, para: cura.id, origem: cura.origem });
}

console.log(`\nthreads lidas: ${snap.size}`);
console.log(`com raiz fantasma: ${afetadas.length + semCura.length}`);
console.log(`  reparáveis: ${afetadas.length}`);
console.log(`  sem id real para usar: ${semCura.length}\n`);

for (const a of afetadas) {
  console.log(`  ${a.id}`);
  console.log(`    ${a.de}`);
  console.log(`    vira ${a.para}   (de ${a.origem})`);
}

if (semCura.length) {
  console.log('\nSEM CURA — ficam como estão (não se inventa raiz duas vezes):');
  for (const s of semCura) {
    console.log(`  ${s.id}  raiz=${s.raiz}  references=${s.refs}`);
  }
}

if (!APLICAR) {
  console.log('\nENSAIO — nada foi gravado. Rode com --apply para aplicar.');
  process.exit(0);
}

if (!afetadas.length) {
  console.log('\nNada a aplicar.');
  process.exit(0);
}

// Lote: são poucas por natureza (só OS aberta pela web antes do conserto).
let gravadas = 0;
for (const a of afetadas) {
  // A raiz também entra na corrente, na frente — é ela que ancora, e o
  // `limitarReferencias` do envio preserva a primeira posição.
  const ref = db.collection('emailThreads').doc(a.id);
  const atual = (await ref.get()).data() || {};
  const referencias = Array.isArray(atual.references) ? atual.references : [];
  const semFantasma = referencias.filter(r => !ehFantasma(r));
  const novas = [...new Set([a.para, ...semFantasma])];

  await ref.update({ rootMessageId: a.para, references: novas });
  gravadas += 1;
}

console.log(`\n${gravadas} thread(s) reparada(s).`);
