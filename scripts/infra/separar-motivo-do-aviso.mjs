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
 * ⚠️ CURA AS DUAS FONTES, e sem isso não curava nada (04/09/2026). O histórico mora
 * em dois lugares: o array `history` no documento e a subcoleção `historyEntries`,
 * que passa a valer assim que `historySubcollectionReady` fica true. E a rota
 * pública de acompanhamento hidrata ANTES de filtrar — `readTicketHistoryFromSubcollection`
 * IGNORA o array embutido quando a subcoleção existe. As duas OS afetadas em
 * produção têm a flag ligada: reparar só o array consertaria o campo que ninguém lê
 * e deixaria o vazamento de pé exatamente na página que o reparo existe para
 * proteger.
 *
 *   node scripts/infra/separar-motivo-do-aviso.mjs           # ensaio (padrão)
 *   node scripts/infra/separar-motivo-do-aviso.mjs --apply   # grava
 */
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ticketHistoryEntryDocumentId } from '../../api/_lib/tickets.js';
import { resolveCredentialsPath, readServiceAccount } from './shared-auth.mjs';
import { precisaSeparar, repararHistorico, separarAvisoDoMotivo } from './separarAvisoDoMotivo.mjs';

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

  // A subcoleção é lida à parte porque ela é a fonte VERDADEIRA das OS já migradas —
  // e ela pode estar suja mesmo quando o array embutido está limpo (e vice-versa).
  const sub = await doc.ref.collection('historyEntries').get();
  const naSubcolecao = sub.docs
    .filter(d => precisaSeparar(d.data()))
    .map(d => ({ ref: d.ref, entrada: d.data(), ...separarAvisoDoMotivo(d.data().text) }));

  if (!reparo && naSubcolecao.length === 0) continue;

  afetadas.push({
    id: doc.id,
    historico: reparo?.novo || null,
    cortes: reparo?.cortes || [],
    de: historico?.length ?? 0,
    para: reparo?.novo.length ?? 0,
    naSubcolecao,
  });
}

const totalDeCortes = afetadas.reduce((soma, a) => soma + a.cortes.length, 0);
const totalNaSubcolecao = afetadas.reduce((soma, a) => soma + a.naSubcolecao.length, 0);

console.log(`\nOS lidas: ${snap.size}`);
console.log(`com motivo colado no aviso: ${afetadas.length}`);
console.log(`entradas a separar no array embutido: ${totalDeCortes}`);
console.log(`entradas a separar na subcoleção:     ${totalNaSubcolecao}\n`);

for (const a of afetadas) {
  console.log(`  ${a.id}   (array: ${a.de} → ${a.para} entradas · subcoleção: ${a.naSubcolecao.length} entrada(s))`);
  for (const c of a.cortes) {
    console.log(`    [array]      fica público:  ${espiar(c.aviso)}`);
    console.log(`    [array]      vira interno:  ${espiar(c.motivo)}`);
  }
  for (const s of a.naSubcolecao) {
    console.log(`    [subcoleção] fica público:  ${espiar(s.aviso)}`);
    console.log(`    [subcoleção] vira interno:  ${espiar(s.motivo)}`);
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

// Só o histórico é reescrito; o resto do doc não é lido nem tocado.
let gravadas = 0;
let entradasNaSubcolecao = 0;

for (const a of afetadas) {
  const ref = db.collection('tickets').doc(a.id);
  if (a.historico) await ref.update({ history: a.historico });

  for (const s of a.naSubcolecao) {
    const idDoMotivo = randomUUID();
    /*
     * A ORDEM NA SUBCOLEÇÃO É POR `time`, não por posição — então o motivo ganha 1ms.
     *
     * No array, o motivo entra logo depois do aviso porque a posição é o que ordena.
     * Aqui a leitura é `orderBy('time','asc')`: com o mesmo instante nos dois, quem
     * decide o desempate é o nome do documento, que é um hash. O motivo poderia
     * aparecer ANTES do aviso que ele explica.
     *
     * 1ms é a menor distorção que torna a ordem determinística, e ela cai numa
     * entrada interna. A alternativa — ordem indefinida — custa mais.
     */
    const instante = s.entrada.time?.toDate?.() || new Date(s.entrada.time);
    const motivo = {
      ...s.entrada,
      id: idDoMotivo,
      text: s.motivo,
      visibility: 'internal',
      time: new Date(instante.getTime() + 1),
    };
    delete motivo.ticketId;
    delete motivo.updatedAt;

    await Promise.all([
      // O aviso é a MESMA entrada, encurtada: mantém id, time e quem escreveu.
      s.ref.update({ text: s.aviso, updatedAt: new Date() }),
      ref.collection('historyEntries').doc(ticketHistoryEntryDocumentId(a.id, idDoMotivo)).set({
        ...motivo,
        ticketId: a.id,
        updatedAt: new Date(),
      }),
    ]);
    entradasNaSubcolecao += 1;
  }
  gravadas += 1;
}

console.log(`\n${gravadas} OS reparada(s) — ${entradasNaSubcolecao} entrada(s) separada(s) na subcoleção.`);
