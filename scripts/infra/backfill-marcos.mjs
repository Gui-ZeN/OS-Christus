/**
 * BACKFILL DOS MARCOS — recupera a linha do tempo que o Serv3 já sabe, e só ela.
 *
 * A partir de 13/08/2026 cada transição grava um marco permanente. As OS que já
 * existiam não têm nenhum: `stageEnteredAt` guardava só a etapa ATUAL e a data das
 * anteriores foi descartada na hora em que a OS avançou.
 *
 * O que dá para recuperar vem do histórico da própria OS, e é pouco de propósito:
 *   - `Triagem concluída…`                     → entrada em "Aguardando Parecer Técnico"
 *   - `Transição manual via chat|Gestão: A -> B` → entrada em B
 *   - `createdAt`                               → "Nova OS"
 *   - `closedAt`                                → "Encerrada"
 *
 * ⚠️ NÃO INVENTA DATA. Etapa sem rastro fica sem marco — a coluna vazia é honesta e
 * diz "o sistema não sabe". Preencher por aproximação produziria uma carteira que
 * parece completa e mente, que é exatamente o defeito do gráfico que leu
 * `closureChecklist.closedAt` (vazio em 92 de 92) e mostrou zero por meses.
 *
 * A PRIMEIRA entrada vence, como no servidor: reabrir não reescreve a linha do tempo.
 *
 *   node scripts/infra/backfill-marcos.mjs            # ensaio (padrão)
 *   node scripts/infra/backfill-marcos.mjs --apply
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';
import { addStageMarco } from '../../api/_lib/statusFlow.js';

const APLICAR = process.argv.includes('--apply');
const conta = readServiceAccount(resolveCredentialsPath());
initializeApp({ credential: cert(conta), projectId: conta.project_id });
const db = getFirestore();

const RX_TRANSICAO = /Transição manual via (?:chat|Gestão): (.+?) -> (.+?)\./;
const RX_TRIAGEM = /^Triagem concluída\. OS aceita/;
const ETAPA_TRIAGEM = 'Aguardando Parecer Técnico';

const paraData = v => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

console.log(`projeto: ${conta.project_id}`);
console.log(APLICAR ? 'modo: APLICANDO\n' : 'modo: ENSAIO (nada será gravado)\n');

const snap = await db.collection('tickets').get();
let comAlgo = 0;
let semNada = 0;
let jaTinham = 0;
let marcosTotais = 0;
const porEtapa = new Map();
const amostra = [];

for (const doc of snap.docs) {
  const t = doc.data() || {};

  // Histórico: subcoleção nas OS migradas, array embutido nas antigas.
  const sub = await doc.ref.collection('historyEntries').get();
  const entradas = (sub.empty ? (Array.isArray(t.history) ? t.history : []) : sub.docs.map(d => d.data()))
    .map(e => ({ ...e, quando: paraData(e.time) }))
    .filter(e => e.quando)
    .sort((a, b) => a.quando - b.quando);

  let marcos = t.marcos && typeof t.marcos === 'object' && !Array.isArray(t.marcos) ? { ...t.marcos } : {};
  const tinhaAntes = Object.keys(marcos).length;

  const acrescentar = (etapa, quando) => {
    const proximo = addStageMarco(marcos, etapa, quando);
    if (!proximo) return;
    marcos = proximo;
    porEtapa.set(etapa, (porEtapa.get(etapa) || 0) + 1);
  };

  acrescentar('Nova OS', paraData(t.createdAt));
  for (const e of entradas) {
    const texto = String(e.text || '');
    if (RX_TRIAGEM.test(texto)) {
      acrescentar(ETAPA_TRIAGEM, e.quando);
      continue;
    }
    const m = texto.match(RX_TRANSICAO);
    if (m) acrescentar(m[2].trim(), e.quando);
  }
  if (t.closedAt) acrescentar('Encerrada', paraData(t.closedAt));

  const novos = Object.keys(marcos).length - tinhaAntes;
  if (tinhaAntes > 0) jaTinham += 1;
  if (novos > 0) {
    comAlgo += 1;
    marcosTotais += novos;
    if (amostra.length < 8) {
      amostra.push(`${doc.id} [${t.status}] → ${Object.keys(marcos).join(' · ')}`);
    }
    if (APLICAR) await doc.ref.set({ marcos }, { merge: true });
  } else if (tinhaAntes === 0) {
    semNada += 1;
  }
}

console.log(`OS na base .................. ${snap.size}`);
console.log(`OS que ganharam marco ....... ${comAlgo}`);
console.log(`OS que já tinham algum ...... ${jaTinham}`);
console.log(`OS sem NENHUM rastro ........ ${semNada}`);
console.log(`marcos gravados ............. ${marcosTotais}`);

console.log('\npor etapa recuperada:');
[...porEtapa.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([etapa, n]) => console.log(`  ${String(n).padStart(4)}  ${etapa}`));

console.log('\namostra:');
amostra.forEach(linha => console.log(`  ${linha}`));

if (!APLICAR) console.log('\nENSAIO — nada foi gravado. Para valer: --apply');
process.exit(0);
