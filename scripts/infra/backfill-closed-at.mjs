/**
 * Recupera `closedAt` das OS que fecharam ANTES do campo existir.
 *
 * Contexto: o gráfico de fluxo (abertas × fechadas × pendências) precisa saber QUANDO
 * cada OS saiu da fila. O único candidato que existia era `closureChecklist.closedAt`,
 * e ele está vazio em 92 de 92 OS fechadas na produção — o checklist de encerramento
 * tem 0 usos em 61 encerramentos. Por isso a barra "Encerradas" do painel de
 * Indicadores mostra ZERO desde sempre, e ninguém notou: um gráfico que mostra zero
 * parece um mês fraco, não um campo vazio.
 *
 * De onde vem a data: da entrada que o próprio sistema escreveu ao trocar a etapa
 * ("Transição manual via chat: X -> Encerrada" / "OS cancelada por Fulano"). Medido
 * antes de escrever este script: as 92 têm essa entrada, nenhuma sem.
 *
 * ⚠️ Isto LÊ TEXTO do histórico, coisa que as regras não fazem de propósito. Aqui é
 * aceitável e é diferente: script de uma vez só, sobre entradas que o sistema mesmo
 * escreveu num formato que ele controla. Se não encontrar, NÃO inventa — deixa sem
 * `closedAt` e reporta. Uma OS fechada sem data aparece como pendência no gráfico,
 * que é honesto; uma data inventada vira uma linha bonita e mentirosa.
 *
 *   node scripts/infra/backfill-closed-at.mjs           # ensaio (padrão)
 *   node scripts/infra/backfill-closed-at.mjs --apply   # grava
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');
const FECHADAS = new Set(['Encerrada', 'Cancelada']);
// Os dois formatos que o sistema escreve. Ancorados no verbo, não na frase inteira:
// o motivo digitado por gente vem depois e não pode influenciar o casamento.
const MARCADOR = /(->\s*(Encerrada|Cancelada))|(OS\s+cancelada\s+por)/i;

initializeApp({ credential: cert(readServiceAccount(resolveCredentialsPath())) });
const db = getFirestore();

const paraData = valor => valor?.toDate?.() || (valor ? new Date(valor) : null);
const iso = data => data.toISOString().slice(0, 16).replace('T', ' ');

const snap = await db.collection('tickets').get();
const alvos = snap.docs.filter(doc => {
  const t = doc.data();
  return FECHADAS.has(t.status) && !t.closedAt;
});

console.log(`OS analisadas: ${snap.size}`);
console.log(`fechadas sem closedAt: ${alvos.length}\n`);

const achados = [];
const semData = [];
const suspeitas = [];

for (const doc of alvos) {
  const t = doc.data();
  const embutido = Array.isArray(t.history) ? t.history : [];
  const sub = await doc.ref.collection('historyEntries').get();
  const todas = [...embutido, ...sub.docs.map(d => d.data())];

  // A ÚLTIMA transição de fechamento, não a primeira: OS reaberta e fechada de novo
  // saiu da fila na segunda vez.
  const entrada = todas
    .filter(e => MARCADOR.test(String(e?.text || '')))
    .map(e => ({ e, quando: paraData(e.time) }))
    .filter(item => item.quando)
    .sort((a, b) => b.quando - a.quando)[0];

  if (!entrada) {
    semData.push(doc.id);
    continue;
  }

  const criada = paraData(t.createdAt) || paraData(t.time);
  // Data de fechamento anterior à abertura é carimbo impossível — não grava.
  if (criada && entrada.quando < criada) {
    suspeitas.push({ id: doc.id, quando: entrada.quando, criada });
    continue;
  }

  achados.push({ ref: doc.ref, id: doc.id, quando: entrada.quando, status: t.status });
}

console.log(`com data recuperada : ${achados.length}`);
console.log(`sem rastro          : ${semData.length}${semData.length ? ` (${semData.slice(0, 6).join(', ')})` : ''}`);
console.log(`data impossível     : ${suspeitas.length}${suspeitas.length ? ` (${suspeitas.slice(0, 6).map(s => s.id).join(', ')})` : ''}`);

const porMes = new Map();
for (const a of achados) {
  const chave = a.quando.toISOString().slice(0, 7);
  porMes.set(chave, (porMes.get(chave) || 0) + 1);
}
console.log('\nfechamentos por mês (o que o gráfico vai passar a mostrar)');
[...porMes.entries()].sort().forEach(([mes, n]) => console.log(`  ${mes}: ${n}`));

console.log('\namostra');
achados.slice(0, 8).forEach(a => console.log(`  ${a.id}  ${iso(a.quando)}  ${a.status}`));

if (!APLICAR) {
  console.log(`\nENSAIO — nada foi gravado. Para aplicar: --apply`);
  process.exit(0);
}

let gravadas = 0;
for (let i = 0; i < achados.length; i += 400) {
  const lote = db.batch();
  for (const a of achados.slice(i, i + 400)) {
    lote.update(a.ref, { closedAt: a.quando });
    gravadas += 1;
  }
  await lote.commit();
}
console.log(`\nGRAVADAS: ${gravadas}`);
process.exit(0);
