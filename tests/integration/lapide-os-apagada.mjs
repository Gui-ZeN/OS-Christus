import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { findDeletedTicketForInbound, recordDeletedTicket } from '../../api/_lib/deletedTickets.js';

/**
 * LÁPIDE DE OS APAGADA, contra o Firestore de verdade.
 *
 * Em 12/08 a coordenadora pediu a exclusão das OS da universidade e 105 saíram. Horas
 * depois, uma resposta de "Ciente. @Fulano, você possui alguém que realize esse
 * serviço?" virou a OS-0331 — OS nova, sem histórico, ressuscitando o trabalho que
 * alguém decidiu apagar. Apagar 105 e ganhar 105 de volta uma a uma é o pior dos dois
 * mundos.
 *
 * É teste de integração porque o que precisa de prova são as CONSULTAS: o
 * `array-contains-any` tem teto de 10 valores e é o tipo de limite que passa no mock e
 * estoura na produção.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const PREFIX = 'OS-LAPIDE-';

async function limpar() {
  const snap = await db.collection('deletedTickets').get();
  const batch = db.batch();
  let n = 0;
  for (const doc of snap.docs) if (doc.id.startsWith(PREFIX)) { batch.delete(doc.ref); n += 1; }
  if (n) await batch.commit();
}

await limpar();

// --- 1. Casa pela thread do Gmail ------------------------------------------------
await recordDeletedTicket(db, {
  ticketId: `${PREFIX}1`,
  gmailThreadId: 'thread-abc',
  messageIds: ['<msg-1@christus.com.br>', 'msg-2@christus.com.br'],
});

const porThread = await findDeletedTicketForInbound(db, { threadId: 'thread-abc' });
check('reconhece pela thread', porThread?.ticketId === `${PREFIX}1`, porThread?.ticketId || 'nada');

// --- 2. Casa pelo In-Reply-To, com e sem os sinais de menor/maior -----------------
const porInReplyTo = await findDeletedTicketForInbound(db, { inReplyTo: '<msg-1@christus.com.br>' });
check('reconhece pelo In-Reply-To', porInReplyTo?.ticketId === `${PREFIX}1`, porInReplyTo?.ticketId || 'nada');

const semSinais = await findDeletedTicketForInbound(db, { inReplyTo: 'MSG-2@christus.com.br' });
check('id sem <> e em maiúscula também casa', semSinais?.ticketId === `${PREFIX}1`, semSinais?.ticketId || 'nada');

// --- 3. References longo: o teto de 10 do array-contains-any ----------------------
// Uma resposta carrega a thread inteira no References. Sem o corte, o Firestore
// recusa a consulta — e o inbound cairia no catch, criando a OS nova de novo.
const referencesLongo = Array.from({ length: 30 }, (_, i) => `<ruido-${i}@x.com>`);
referencesLongo.push('<msg-1@christus.com.br>');
const comReferences = await findDeletedTicketForInbound(db, { references: referencesLongo });
check(
  'References com 31 ids não estoura a consulta',
  comReferences?.ticketId === `${PREFIX}1`,
  comReferences?.ticketId || 'nada — o id da lápide precisa estar entre os 10 últimos'
);

// --- 4. Conversa que NÃO é de OS apagada passa direto ------------------------------
const desconhecida = await findDeletedTicketForInbound(db, {
  threadId: 'thread-que-nao-existe',
  inReplyTo: '<qualquer@x.com>',
});
check('conversa sem lápide devolve null', desconhecida === null, String(desconhecida));

// --- 5. Lápide sem sinal nenhum não é gravada --------------------------------------
// Um documento que nunca casa com nada é pior que documento nenhum: ocupa espaço e
// dá a impressão de que a OS está protegida.
const semSinal = await recordDeletedTicket(db, { ticketId: `${PREFIX}2`, messageIds: [] });
const existe = await db.collection('deletedTickets').doc(`${PREFIX}2`).get();
check('lápide sem thread e sem mensagem é recusada', semSinal === false && !existe.exists);

await limpar();

const falhas = results.filter(r => !r.pass).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram.`);
process.exit(falhas ? 1 : 0);
