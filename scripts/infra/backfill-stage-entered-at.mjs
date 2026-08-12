/**
 * Recupera `stageEnteredAt` das OS que entraram na etapa atual ANTES do campo existir.
 *
 * O campo passou a ser carimbado pelo servidor em 11/08, a cada transição. Só que ele
 * só nasce quando a OS SE MOVE — e a fila é feita justamente de OS que não se movem:
 * 6 das 117 OS vivas têm o carimbo (5%).
 *
 * Sem ele, o gráfico "Tempo médio por etapa" usa `daysBetween(ticket.time, hoje)`, que
 * é a IDADE DA OS, não o tempo na etapa. Uma OS aberta há 40 dias e movida para
 * execução hoje aparece como 40 dias de execução. O número é sempre plausível e cresce
 * de forma coerente, que é o que faz ninguém desconfiar.
 *
 * De onde vem a data: da última entrada de histórico que registra transição PARA a
 * etapa atual — as duas frases que o próprio sistema escreve.
 *
 * ⚠️ Lê TEXTO do histórico, coisa que as regras não fazem de propósito. Aqui é script
 * de uma vez só, sob revisão, sobre frases que o sistema mesmo escreveu. Se não achar,
 * NÃO inventa: deixa sem o campo e reporta. O gráfico cai para a idade da OS nesses
 * casos, que é o comportamento de hoje — pior seria carimbar data adivinhada.
 *
 *   node scripts/infra/backfill-stage-entered-at.mjs           # ensaio (padrão)
 *   node scripts/infra/backfill-stage-entered-at.mjs --apply   # grava
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');
const MORTAS = new Set(['Encerrada', 'Cancelada']);

initializeApp({ credential: cert(readServiceAccount(resolveCredentialsPath())) });
const db = getFirestore();

const paraData = valor => valor?.toDate?.() || (valor ? new Date(valor) : null);
const iso = d => d.toISOString().slice(0, 16).replace('T', ' ');

/** Escapa o que o RegExp trataria como sintaxe — nomes de etapa têm parênteses e acento. */
const escapar = texto => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const snap = await db.collection('tickets').get();
const alvos = snap.docs.filter(doc => {
  const t = doc.data();
  return !MORTAS.has(t.status) && !t.stageEnteredAt;
});

console.log(`OS analisadas: ${snap.size}`);
console.log(`vivas sem stageEnteredAt: ${alvos.length}\n`);

const achados = [];
const semRastro = [];
const suspeitas = [];

for (const doc of alvos) {
  const t = doc.data();
  const etapa = String(t.status || '').trim();
  if (!etapa) { semRastro.push(doc.id); continue; }

  const embutido = Array.isArray(t.history) ? t.history : [];
  const sub = await doc.ref.collection('historyEntries').get();
  const todas = [...embutido, ...sub.docs.map(d => d.data())];

  // As duas frases que o sistema escreve ao mudar de etapa. Ancoradas no DESTINO ser
  // a etapa atual — "-> Encerrada" numa OS que hoje está em orçamento é história
  // antiga (reaberta) e não pode virar o carimbo de entrada.
  const marcadores = [
    new RegExp(`->\\s*${escapar(etapa)}\\s*(\\.|$)`, 'i'),
    new RegExp(`Status atualizado de\\s+"[^"]+"\\s+para\\s+"${escapar(etapa)}"`, 'i'),
  ];

  let entrada = todas
    .filter(e => marcadores.some(re => re.test(String(e?.text || ''))))
    .map(e => ({ quando: paraData(e.time), origem: 'transição' }))
    .filter(item => item.quando)
    .sort((a, b) => b.quando - a.quando)[0];

  // 95 das 110 nunca mudaram de etapa — 89 delas paradas em Parecer Técnico. Para
  // essas a transição não existe porque não houve; o que houve foi a TRIAGEM, que é
  // o momento em que a OS entrou na etapa onde está até hoje.
  const houveAlgumaTransicao = todas.some(e => /->|Status atualizado de/i.test(String(e?.text || '')));
  if (!entrada && etapa === 'Aguardando Parecer Técnico' && !houveAlgumaTransicao) {
    const triagem = todas
      .filter(e => /Triagem conclu[ií]da/i.test(String(e?.text || '')))
      .map(e => ({ quando: paraData(e.time), origem: 'triagem' }))
      .filter(item => item.quando)
      .sort((a, b) => b.quando - a.quando)[0];
    if (triagem) entrada = triagem;
  }

  // Nem transição nem triagem: a OS está na etapa em que nasceu. Isso é DEDUÇÃO, não
  // chute — ausência de transição no histórico completo significa que ela não se
  // moveu. Restrito às etapas em que uma OS pode NASCER: para as demais, chegar lá
  // sem rastro seria história incompleta, e história incompleta não vira carimbo.
  if (!entrada && !houveAlgumaTransicao && ['Nova OS', 'Aguardando Parecer Técnico'].includes(etapa)) {
    const criacao = paraData(t.createdAt) || paraData(t.time);
    if (criacao) entrada = { quando: criacao, origem: 'criação' };
  }

  if (!entrada) { semRastro.push(doc.id); continue; }

  const criada = paraData(t.createdAt) || paraData(t.time);
  if (criada && entrada.quando < criada) { suspeitas.push(doc.id); continue; }

  achados.push({ ref: doc.ref, id: doc.id, quando: entrada.quando, etapa });
}

console.log(`com data recuperada : ${achados.length}`);
console.log(`sem rastro          : ${semRastro.length}${semRastro.length ? ` (ex.: ${semRastro.slice(0, 5).join(', ')})` : ''}`);
console.log(`data impossível     : ${suspeitas.length}`);

const agora = new Date();
const porEtapa = new Map();
for (const a of achados) {
  const dias = Math.round((agora - a.quando) / 86400000);
  if (!porEtapa.has(a.etapa)) porEtapa.set(a.etapa, []);
  porEtapa.get(a.etapa).push(dias);
}
console.log('\nO QUE O GRÁFICO PASSA A MOSTRAR (dias na etapa vs. idade da OS)');
for (const [etapa, dias] of [...porEtapa.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const media = Math.round(dias.reduce((s, d) => s + d, 0) / dias.length);
  console.log(`  ${String(dias.length).padStart(3)} OS · ${String(media).padStart(3)} dias na etapa · ${etapa}`);
}

console.log('\namostra');
achados.slice(0, 6).forEach(a => console.log(`  ${a.id}  ${iso(a.quando)}  ${a.etapa}`));

if (!APLICAR) {
  console.log('\nENSAIO — nada foi gravado. Para aplicar: --apply');
  process.exit(0);
}

let gravadas = 0;
for (let i = 0; i < achados.length; i += 400) {
  const lote = db.batch();
  for (const a of achados.slice(i, i + 400)) {
    lote.update(a.ref, { stageEnteredAt: a.quando });
    gravadas += 1;
  }
  await lote.commit();
}
console.log(`\nGRAVADAS: ${gravadas}`);
process.exit(0);
