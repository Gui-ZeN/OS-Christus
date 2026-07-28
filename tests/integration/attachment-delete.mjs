import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Regressão do P1 "exclusão de anexo não é atômica" (4ª auditoria).
 *
 * O DELETE antigo apagava o objeto do Storage e devolvia ok; quem tirava a
 * referência era a TELA, numa segunda chamada. Falhar no meio deixava referência
 * apontando para arquivo inexistente. E não havia bloqueio por status: dava para
 * apagar o comprovante de um lançamento já pago.
 *
 * Agora: referência sai primeiro (transacional), objeto depois, evidência
 * aprovada é recusada e tudo vai para o log de auditoria.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';
const TICKET_ID = 'OS-ATT-DEL1';

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(email = 'gestor.e2e@test.local') {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test@123456', returnSecureToken: true }),
    }
  );
  const json = await res.json();
  if (!json.idToken) throw new Error(`sem idToken: ${JSON.stringify(json)}`);
  return json.idToken;
}

const ticketRef = db.collection('tickets').doc(TICKET_ID);
const p = suffix => `attachments/tickets/${suffix}`;
const PENDING_PAYMENT_ATT = p(`payments/${TICKET_ID}/pay-pendente/nota.pdf`);
const PAID_PAYMENT_ATT = p(`payments/${TICKET_ID}/pay-pago/comprovante.pdf`);
const CLOSURE_ATT = p(`pdfs/${TICKET_ID}/closure-ata.pdf`);
const HISTORY_ATT = p(`messages/${TICKET_ID}/internal/foto.png`);

async function clearSubcollections() {
  for (const name of ['payments', 'measurements', 'quotes', 'contracts', 'historyEntries']) {
    const snap = await ticketRef.collection(name).get();
    for (const doc of snap.docs) await doc.ref.delete();
  }
}

async function resetFixture() {
  await clearSubcollections();
  await ticketRef.set({
    id: TICKET_ID,
    subject: 'OS para teste de exclusão de anexo',
    status: 'Aguardando pagamento',
    sede: 'PQL3',
    siteId: 'site-pql3',
    regionId: 'region-fortaleza',
    requester: 'Teste',
    requesterEmail: 'teste@px.com.br',
    time: new Date(),
    historySubcollectionReady: true,
    closureChecklist: {
      documents: [{ id: 'doc-1', path: CLOSURE_ATT, name: 'ata.pdf' }],
    },
    history: [{ id: 'h-1', type: 'internal', text: 'foto', attachments: [{ path: HISTORY_ATT }] }],
  });
  await ticketRef.collection('historyEntries').doc(`${TICKET_ID}__h-1`).set({
    id: 'h-1',
    type: 'internal',
    text: 'foto',
    attachments: [{ path: HISTORY_ATT }],
  });
  await ticketRef.collection('payments').doc('pay-pendente').set({
    id: 'pay-pendente',
    status: 'pending',
    label: 'Lançamento 1',
    attachments: [{ id: 'att-1', path: PENDING_PAYMENT_ATT, name: 'nota.pdf' }],
  });
  await ticketRef.collection('payments').doc('pay-pago').set({
    id: 'pay-pago',
    status: 'paid',
    label: 'Lançamento 2',
    attachments: [{ id: 'att-2', path: PAID_PAYMENT_ATT, name: 'comprovante.pdf' }],
  });
}

async function deleteAttachment(token, path) {
  const query = new URLSearchParams({ ticketId: TICKET_ID, path });
  const res = await fetch(`${API}/api/attachments?${query.toString()}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const token = await signIn();
  await resetFixture();

  // --- 1. Evidência aprovada: recusa e NÃO toca em nada ---------------------
  const pago = await deleteAttachment(token, PAID_PAYMENT_ATT);
  const pagoDoc = (await ticketRef.collection('payments').doc('pay-pago').get()).data();
  check('comprovante de lançamento PAGO é recusado', pago.status === 409, `HTTP ${pago.status}`);
  check(
    'recusa cita o motivo (não é erro genérico)',
    /pago/i.test(String(pago.json?.error || '')),
    String(pago.json?.error || '')
  );
  check(
    'referência do lançamento pago permanece intacta',
    (pagoDoc?.attachments || []).length === 1,
    `attachments=${(pagoDoc?.attachments || []).length}`
  );

  // --- 2. Lançamento pendente: referência sai de verdade --------------------
  const pendente = await deleteAttachment(token, PENDING_PAYMENT_ATT);
  const pendenteDoc = (await ticketRef.collection('payments').doc('pay-pendente').get()).data();
  check('anexo de lançamento pendente é aceito', pendente.status === 200, `HTTP ${pendente.status} ${JSON.stringify(pendente.json).slice(0, 200)}`);
  check(
    'referência REMOVIDA pelo servidor (a tela não precisa mais fazer isso)',
    (pendenteDoc?.attachments || []).length === 0,
    `attachments=${(pendenteDoc?.attachments || []).length}`
  );
  check(
    'resposta informa de onde removeu',
    Array.isArray(pendente.json?.removedFrom) && pendente.json.removedFrom.includes('payments/pay-pendente'),
    JSON.stringify(pendente.json?.removedFrom)
  );

  // --- 3. Documento de encerramento sai do checklist ------------------------
  const closure = await deleteAttachment(token, CLOSURE_ATT);
  const ticketDoc = (await ticketRef.get()).data();
  check('documento de encerramento é aceito', closure.status === 200, `HTTP ${closure.status}`);
  check(
    'sai do closureChecklist.documents',
    (ticketDoc?.closureChecklist?.documents || []).length === 0,
    `documents=${(ticketDoc?.closureChecklist?.documents || []).length}`
  );

  // --- 4. Anexo de histórico: some do embutido E da subcoleção --------------
  const historia = await deleteAttachment(token, HISTORY_ATT);
  const depois = (await ticketRef.get()).data();
  const entrada = (
    await ticketRef.collection('historyEntries').doc(`${TICKET_ID}__h-1`).get()
  ).data();
  check('anexo de histórico é aceito', historia.status === 200, `HTTP ${historia.status}`);
  check(
    'sai do histórico embutido no doc da OS',
    ((depois?.history || [])[0]?.attachments || []).length === 0,
    `attachments=${((depois?.history || [])[0]?.attachments || []).length}`
  );
  check(
    'sai também da subcoleção historyEntries (a janela embutida não é a fonte)',
    (entrada?.attachments || []).length === 0,
    `attachments=${(entrada?.attachments || []).length}`
  );

  // --- 5. Auditoria --------------------------------------------------------
  const auditSnap = await db
    .collection('auditLogs')
    .where('entityId', '==', TICKET_ID)
    .where('action', '==', 'attachment.delete')
    .get();
  check('cada exclusão gerou registro de auditoria', auditSnap.size === 3, `registros=${auditSnap.size}`);
  const comAutor = auditSnap.docs.filter(doc => String(doc.data()?.actor || '').trim()).length;
  check('auditoria identifica quem excluiu', comAutor === auditSnap.size, `com autor=${comAutor}`);

  // --- 6. Segunda exclusão do mesmo anexo não encontra referência -----------
  const repetido = await deleteAttachment(token, PENDING_PAYMENT_ATT);
  check(
    'excluir de novo o mesmo anexo devolve 404 (referência já não existe)',
    repetido.status === 404,
    `HTTP ${repetido.status}`
  );

  await clearSubcollections();
  await ticketRef.delete();
  for (const doc of auditSnap.docs) await doc.ref.delete();

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('FALHOU  erro inesperado —', error);
  process.exit(1);
});
