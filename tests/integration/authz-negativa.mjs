import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * AUTORIZAÇÃO NEGATIVA — a categoria de teste que a 4ª auditoria apontou como
 * ausente: a suíte cobria os fluxos esperados, não quem NÃO pode fazer o quê.
 *
 * 1) Reprocessamento inbound (P2): aceitava Admin, Gestor E Diretor. A operação
 *    reescreve sede, thread e histórico de VÁRIOS tickets numa janela de até 60
 *    dias — é administrativa. Agora só Admin, e registrada em auditLogs.
 * 2) Leitura de dados financeiros: o gate existia só no cliente, enquanto o GET
 *    de compras entregava contrato e pagamento para qualquer autenticado no
 *    território. `Usuario` (solicitante de unidade) passa a receber 403.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signIn(email) {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Test@123456', returnSecureToken: true }),
    }
  );
  const json = await res.json();
  if (!json.idToken) throw new Error(`sem idToken para ${email}: ${JSON.stringify(json)}`);
  return json.idToken;
}

async function reprocess(token, days = 1) {
  const res = await fetch(`${API}/api/mail?route=reprocess-inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ days }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  // Papéis que NÃO podem mais disparar, testados um a um.
  for (const [papel, email] of [
    ['Gestor', 'gestor.e2e@test.local'],
    ['Diretor', 'diretor.e2e@test.local'],
    ['Usuario', 'usuario.pe@test.local'],
  ]) {
    const token = await signIn(email);
    const res = await reprocess(token);
    check(
      `${papel} NÃO consegue reprocessar o inbound`,
      res.status === 403,
      `HTTP ${res.status} ${JSON.stringify(res.json).slice(0, 120)}`
    );
  }

  // Sem autenticação nenhuma.
  const semAuth = await fetch(`${API}/api/mail?route=reprocess-inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days: 1 }),
  });
  check('sem autenticação é recusado', semAuth.status === 401 || semAuth.status === 403, `HTTP ${semAuth.status}`);

  // Admin continua conseguindo, e a execução deixa trilha.
  const antes = (
    await db.collection('auditLogs').where('action', '==', 'mail.reprocess-inbound').get()
  ).size;
  const adminToken = await signIn('admin@test.local');
  const admin = await reprocess(adminToken, 1);
  check('Admin continua conseguindo reprocessar', admin.status === 200, `HTTP ${admin.status}`);

  const depoisSnap = await db
    .collection('auditLogs')
    .where('action', '==', 'mail.reprocess-inbound')
    .get();
  check(
    'execução do Admin gerou registro de auditoria',
    depoisSnap.size === antes + 1,
    `antes=${antes} depois=${depoisSnap.size}`
  );

  const registro = depoisSnap.docs
    .map(doc => doc.data())
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];
  check('auditoria identifica QUEM disparou', Boolean(String(registro?.actor || '').trim()), String(registro?.actor));
  check(
    'auditoria guarda a JANELA reprocessada',
    Number(registro?.before?.windowDays) === 1 && Boolean(registro?.before?.since),
    `windowDays=${registro?.before?.windowDays} since=${registro?.before?.since}`
  );
  check(
    'auditoria guarda o RESULTADO da execução',
    registro?.after != null && typeof registro.after === 'object',
    JSON.stringify(registro?.after || null).slice(0, 120)
  );

  for (const doc of depoisSnap.docs) await doc.ref.delete();


  // --- Dados financeiros fechados para `Usuario` NO BACKEND ------------------
  // O gate existia so no cliente (KpiView escondia a aba), enquanto o GET de
  // compras entregava contrato e pagamento do territorio para qualquer
  // autenticado — uma requisicao de distancia.
  for (const [papel, email, esperado] of [
    ['Usuario', 'usuario.pe@test.local', 403],
    ['Gestor', 'gestor.e2e@test.local', 200],
    ['Diretor', 'diretor.e2e@test.local', 200],
    ['Admin', 'admin@test.local', 200],
  ]) {
    const token = await signIn(email);
    const res = await fetch(`${API}/api/procurement`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    check(
      `GET /api/procurement para ${papel} responde ${esperado}`,
      res.status === esperado,
      `HTTP ${res.status}`
    );
    if (esperado === 403) {
      check(
        'a recusa nao vaza nenhum dado financeiro no corpo',
        !json.contractsByTicket && !json.paymentsByTicket && !json.quotesByTicket,
        JSON.stringify(json).slice(0, 120)
      );
    }
  }

  // --- O PDF do estado da OS respeita o TERRITORIO --------------------------
  //
  // O papel ja e conferido (Admin+Gestor, na matriz). O que se afirma aqui e o
  // segundo portao: uma rota de OS que nasce sem `canUserAccessTicket` entrega, num
  // arquivo pronto para circular, uma OS que a pessoa nao consegue nem abrir na
  // tela. Aconteceu neste repositorio — a rota de compromissos nasceu assim.
  //
  // O Gestor do E2E esta vinculado a universidade/PQL3. OS-0003 e da regiao-sul.
  for (const [ticketId, esperado, motivo] of [
    ['OS-0001', 200, 'OS da sede do Gestor (PQL3)'],
    ['OS-0003', 403, 'OS de outra regiao (SUL3)'],
  ]) {
    const token = await signIn('gestor.e2e@test.local');
    const res = await fetch(`${API}/api/tickets?route=ticket-pdf&id=${ticketId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const corpo = Buffer.from(await res.arrayBuffer());
    check(
      `PDF de ${ticketId} para o Gestor responde ${esperado} — ${motivo}`,
      res.status === esperado,
      `HTTP ${res.status}`
    );
    if (esperado === 200) {
      // O 200 tem que ser um PDF de verdade: `Content-Type` certo com corpo vazio e
      // exatamente o defeito que esta familia ja produziu.
      check(
        `${ticketId} volta um PDF com conteudo`,
        corpo.subarray(0, 5).toString('latin1') === '%PDF-' && corpo.length > 1000,
        `${corpo.length} bytes`
      );
    } else {
      check(
        `a recusa de ${ticketId} nao devolve documento nenhum`,
        corpo.subarray(0, 5).toString('latin1') !== '%PDF-',
        corpo.subarray(0, 40).toString('latin1')
      );
    }
  }

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('FALHOU  erro inesperado —', error);
  process.exit(1);
});
