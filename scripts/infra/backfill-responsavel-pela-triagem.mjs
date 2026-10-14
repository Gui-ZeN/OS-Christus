/**
 * Dá responsável às OS vivas que nunca tiveram um: quem fez a triagem.
 *
 * Desde 14/10/2026 aceitar a OS grava quem aceitou como responsável
 * (`src/views/inbox/responsavelAoAceitar.ts`). Antes disso aceitar não gravava
 * ninguém, e a coluna "Responsável" da Gestão ficou cheia de "definir".
 *
 * De onde vem a pessoa: da entrada que o próprio sistema escreve ao aceitar —
 * "Triagem concluída. OS aceita…", com `sender` = "Nome (Papel)". O nome é casado
 * com um Admin ou Gestor ATIVO do diretório (os papéis que o modal oferece).
 *
 * ⚠️ Lê TEXTO do histórico, como os outros backfills: script de uma vez só, sob
 * revisão, sobre uma frase que o sistema mesmo escreve. Se não acha a triagem, se o
 * nome não casa com ninguém, ou casa com mais de um, NÃO inventa: deixa "definir" e
 * reporta.
 *
 * `setAt` = AGORA, não a data da triagem: a regra "com responsável e sem progresso"
 * conta a partir dele, e cobrar hoje quem só agora soube que é responsável por uma
 * OS parada há meses é punir quem não teve chance de agir.
 *
 *   node scripts/infra/backfill-responsavel-pela-triagem.mjs           # ensaio (padrão)
 *   node scripts/infra/backfill-responsavel-pela-triagem.mjs --apply   # grava
 */
import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { appendTicketHistory } from '../../api/_lib/tickets.js';
import { recomputeOperationalAttention } from '../../api/_lib/operationalAttention.js';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';

const APLICAR = process.argv.includes('--apply');
const MORTAS = new Set(['Encerrada', 'Cancelada']);
const TRIAGEM = /^Triagem conclu[ií]da/i;

initializeApp({ credential: cert(readServiceAccount(resolveCredentialsPath())) });
const db = getFirestore();

const paraData = valor => valor?.toDate?.() || (valor ? new Date(valor) : null);
const normalizar = texto =>
  String(texto || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
/** "Thaís (Gestor)" → "thais". */
const nomeDoRemetente = sender => normalizar(String(sender || '').replace(/\s*\([^)]*\)\s*$/, ''));

const usuarios = (await db.collection('users').get()).docs
  .map(doc => doc.data())
  .filter(u => (u.role === 'Admin' || u.role === 'Gestor') && u.status === 'Ativo' && u.active !== false && u.email);
const porNome = new Map();
for (const u of usuarios) {
  const chave = normalizar(u.name);
  if (!chave) continue;
  porNome.set(chave, [...(porNome.get(chave) || []), u]);
}

const snap = await db.collection('tickets').get();
const alvos = snap.docs.filter(doc => {
  const t = doc.data();
  return !MORTAS.has(t.status) && !t.excludedFromMetrics && !t.responsible?.email;
});

console.log(`OS analisadas: ${snap.size}`);
console.log(`vivas sem responsável: ${alvos.length}`);
console.log(`Admin/Gestor ativos no diretório: ${usuarios.length}\n`);

const achados = [];
const semTriagem = [];
const semPessoa = [];

for (const doc of alvos) {
  const t = doc.data();
  const embutido = Array.isArray(t.history) ? t.history : [];
  const sub = (await doc.ref.collection('historyEntries').get()).docs.map(d => d.data());
  // A triagem mais RECENTE: OS cancelada e reaberta passa por ela de novo.
  const triagem = [...embutido, ...sub]
    .filter(h => TRIAGEM.test(String(h?.text || '').trim()))
    .sort((a, b) => (paraData(b.time)?.getTime() || 0) - (paraData(a.time)?.getTime() || 0))[0];

  if (!triagem) {
    semTriagem.push(doc.id);
    continue;
  }
  const nome = nomeDoRemetente(triagem.sender);
  const candidatos = porNome.get(nome) || [];
  if (candidatos.length !== 1) {
    semPessoa.push({
      id: doc.id,
      sender: triagem.sender,
      motivo: candidatos.length ? `${candidatos.length} pessoas com esse nome` : 'não é Admin/Gestor ativo',
    });
    continue;
  }
  achados.push({ doc, pessoa: candidatos[0], triagemEm: paraData(triagem.time) });
}

console.log(`Com quem fez a triagem identificado: ${achados.length}`);
for (const { doc, pessoa, triagemEm } of achados) {
  console.log(`  ${doc.id.padEnd(9)} → ${pessoa.name} <${pessoa.email}>  (triagem em ${triagemEm?.toISOString().slice(0, 10) || '?'})`);
}
console.log(`\nSem entrada de triagem no histórico (ficam "definir"): ${semTriagem.length}`);
if (semTriagem.length) console.log(`  ${semTriagem.join(', ')}`);
console.log(`\nTriagem achada, mas sem pessoa certa (ficam "definir"): ${semPessoa.length}`);
for (const item of semPessoa) console.log(`  ${item.id.padEnd(9)} sender="${item.sender}" — ${item.motivo}`);

if (!APLICAR) {
  console.log('\nEnsaio: nada foi gravado. Rode com --apply para gravar os identificados.');
  process.exit(0);
}

const agora = new Date();
let gravadas = 0;
for (const { doc, pessoa } of achados) {
  // Relê dentro da transação: alguém pode ter definido o responsável à mão no meio.
  const ok = await db.runTransaction(async tx => {
    const fresco = await tx.get(doc.ref);
    if (fresco.data()?.responsible?.email) return false;
    tx.update(doc.ref, {
      responsible: { email: pessoa.email, name: pessoa.name, setAt: agora },
      updatedAt: agora,
    });
    return true;
  });
  if (!ok) continue;
  // Pelo helper do sistema: OS ainda não migrada lê o histórico EMBUTIDO, e escrever
  // só na subcoleção deixaria a entrada invisível nela. Id fixo = rodar de novo não
  // duplica.
  await appendTicketHistory(db, doc.ref, [{
    id: `responsavel-pela-triagem-${doc.id}`,
    type: 'system',
    sender: 'Sistema',
    time: agora,
    text: `Responsável pela OS: ${pessoa.name} (${pessoa.email}), por ter feito a triagem.`,
    visibility: 'internal',
  }]);
  // O responsável entra na projeção de atenção ("com responsável e sem progresso").
  await recomputeOperationalAttention(db, doc.id);
  gravadas += 1;
}
console.log(`\nGravadas: ${gravadas} de ${achados.length}.`);
