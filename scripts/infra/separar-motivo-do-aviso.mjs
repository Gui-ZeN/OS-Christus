/**
 * SEPARA O MOTIVO DIGITADO DO AVISO DE ETAPA, NO HISTÓRICO JÁ GRAVADO.
 *
 * O defeito: até 31/08, a Caixa de Entrada gravava aceite e cancelamento como UMA
 * frase — `Triagem concluída. … Motivo da transição: <digitado>` e `OS cancelada por
 * X. Motivo: <digitado>`. As duas começam com marcador que o filtro de visibilidade
 * reconhece como público, então o texto digitado ia junto para a página do
 * solicitante, e passaria também para o PDF do estado da OS, que circula por e-mail
 * e é impresso.
 *
 * O conserto no código impede mistura NOVA (duas entradas, o motivo já nasce
 * `internal`). Este script cura as antigas — sem ele, todo aceite e todo
 * cancelamento gravado antes de hoje continua com o motivo colado no aviso.
 *
 * ⚠️ POR QUE SEPARAR E NÃO SÓ ESCONDER. Marcar a frase inteira como interna seria
 * uma linha e resolveria o vazamento — e tiraria do solicitante o aviso de que a OS
 * foi aceita ou cancelada, retroativamente, em centenas de OS. Ele perde a única
 * coisa que tem. Separar preserva o aviso e recolhe só o que veio de um teclado.
 *
 * ⚠️ ONDE CORTAR É DECISÃO TESTADA, não regex improvisada aqui: mora em
 * `separarAvisoDoMotivo.mjs`, com teste em `tests/unit/separarAvisoDoMotivo.test.ts`,
 * metade dele sobre o que NÃO pode casar. Um reparo que roda uma vez sobre meses de
 * histórico não tem segunda chance — se cortar errado, o erro fica gravado.
 *
 * ⚠️ É IDEMPOTENTE. Entrada que já tem `visibility` não é tocada, então rodar duas
 * vezes dá o mesmo resultado que rodar uma.
 *
 *   node scripts/infra/separar-motivo-do-aviso.mjs           # ensaio (padrão)
 *   node scripts/infra/separar-motivo-do-aviso.mjs --apply   # grava
 */
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';
import { repararHistorico } from './separarAvisoDoMotivo.mjs';

const APLICAR = process.argv.includes('--apply');

/** Corta para o ensaio caber na tela sem esconder o que importa. */
const espiar = (texto, n = 90) => (texto.length > n ? `${texto.slice(0, n)}…` : texto);

const serviceAccount = readServiceAccount(resolveCredentialsPath());
initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
const db = getFirestore();

const snap = await db.collection('tickets').get();

const afetadas = [];

for (const doc of snap.docs) {
  const historico = doc.data()?.history;
  const reparo = repararHistorico(historico, randomUUID);
  if (!reparo) continue;

  afetadas.push({
    id: doc.id,
    historico: reparo.novo,
    cortes: reparo.cortes,
    de: historico.length,
    para: reparo.novo.length,
  });
}

const totalDeCortes = afetadas.reduce((soma, a) => soma + a.cortes.length, 0);

console.log(`\nOS lidas: ${snap.size}`);
console.log(`com motivo colado no aviso: ${afetadas.length}`);
console.log(`entradas a separar: ${totalDeCortes}\n`);

for (const a of afetadas) {
  console.log(`  ${a.id}   (${a.de} → ${a.para} entradas)`);
  for (const c of a.cortes) {
    console.log(`    fica público:  ${espiar(c.aviso)}`);
    console.log(`    vira interno:  ${espiar(c.motivo)}`);
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

// Só o campo `history` é reescrito; o resto do doc não é lido nem tocado.
let gravadas = 0;
for (const a of afetadas) {
  await db.collection('tickets').doc(a.id).update({ history: a.historico });
  gravadas += 1;
}

console.log(`\n${gravadas} OS reparada(s).`);
