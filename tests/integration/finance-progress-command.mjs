import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Regressão do P1 "andamento parcialmente transacional" (4ª auditoria).
 *
 * O InboxView gravava o andamento em TRÊS chamadas soltas — savePayment →
 * saveMeasurement → updateTicket (esta última sem await e sem catch). Falhar no
 * meio deixava pagamento sem medição, ou os dois gravados com a OS parada no
 * percentual antigo, e sem erro visível na tela.
 *
 * Agora é um comando só (`recordMeasurement`). Este teste prova as três
 * propriedades que a versão artesanal não tinha: TUDO junto, NADA pela metade e
 * retry que não duplica lançamento.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';
const TICKET_ID = 'OS-FIN-TX01';

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

async function deleteSubcollections() {
    // financeSnapshots junto: o comando grava commandKey nas DUAS coleções, e
  // limpar só uma deixa estado inconsistente (replay não detectado + create
  // estourando ALREADY_EXISTS) — foi assim que este teste falhou na 2ª execução.
  for (const name of ['payments', 'measurements', 'contracts', 'financeCommands', 'financeSnapshots', 'history']) {
    const snap = await ticketRef.collection(name).get();
    for (const doc of snap.docs) await doc.ref.delete();
  }
}

async function resetFixture({ withContract = true } = {}) {
  await deleteSubcollections();
  await ticketRef.set({
    id: TICKET_ID,
    subject: 'Obra para teste transacional',
    status: 'Em andamento',
    sede: 'PQL3',
    siteId: 'site-pql3',
    regionId: 'region-fortaleza',
    requester: 'Teste',
    requesterEmail: 'teste@px.com.br',
    time: new Date(),
    history: [],
    executionProgress: {
      paymentFlowParts: 4,
      currentPercent: 0,
      releasedPercent: 0,
      startedAt: new Date(),
    },
  });
  if (withContract) {
    await ticketRef.collection('contracts').doc('contract-1').set({
      id: 'contract-1',
      vendor: 'ACME Obras',
      value: 'R$ 100.000,00',
      initialPlannedValue: 'R$ 100.000,00',
    });
  }
}

function commandBody({ key, paymentId, measurementId, grossValue }) {
  return {
    action: 'recordMeasurement',
    ticketId: TICKET_ID,
    idempotencyKey: key,
    payment: { id: paymentId, vendor: 'ACME Obras', grossValue, budgetSource: 'initial' },
    measurement: { id: measurementId, grossValue, notes: 'medição de teste', budgetSource: 'initial' },
  };
}

async function runCommand(token, body) {
  const res = await fetch(`${API}/api/finance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function readState() {
  const [ticketSnap, payments, measurements] = await Promise.all([
    ticketRef.get(),
    ticketRef.collection('payments').get(),
    ticketRef.collection('measurements').get(),
  ]);
  return {
    progress: Number(ticketSnap.data()?.executionProgress?.currentPercent || 0),
    history: (ticketSnap.data()?.history || []).length,
    payments: payments.size,
    measurements: measurements.size,
  };
}

async function main() {
  const token = await signIn();

  // --- 1. Sucesso: as quatro escritas acontecem juntas ---------------------
  await resetFixture();
  const ok = await runCommand(
    token,
    commandBody({
      key: 'tx-sucesso-01',
      paymentId: 'pay-tx-1',
      measurementId: 'meas-tx-1',
      grossValue: 'R$ 25.000,00',
    })
  );
  check('sucesso responde 200', ok.status === 200, `HTTP ${ok.status}${ok.status === 200 ? '' : ' ' + JSON.stringify(ok.json)}`);
  const depois = await readState();
  check('pagamento gravado', depois.payments === 1, `payments=${depois.payments}`);
  check('medição gravada', depois.measurements === 1, `measurements=${depois.measurements}`);
  check(
    'progresso da OS avançou na MESMA operação',
    depois.progress === 25,
    `currentPercent=${depois.progress} (esperado 25 de 25k/100k)`
  );
  check('histórico registrou o andamento', depois.history >= 1, `entradas=${depois.history}`);

  // --- 2. Replay: mesma chave não duplica lançamento -----------------------
  const replay = await runCommand(
    token,
    commandBody({
      key: 'tx-sucesso-01',
      paymentId: 'pay-tx-1',
      measurementId: 'meas-tx-1',
      grossValue: 'R$ 25.000,00',
    })
  );
  const aposReplay = await readState();
  check('replay responde 200 (não erro)', replay.status === 200, `HTTP ${replay.status}`);
  check('replay marcado como tal', replay.json?.replayed === true, `replayed=${replay.json?.replayed}`);
  check(
    'replay NÃO criou segundo lançamento',
    aposReplay.payments === 1 && aposReplay.measurements === 1,
    `payments=${aposReplay.payments} measurements=${aposReplay.measurements}`
  );
  check(
    'replay NÃO avançou o progresso de novo',
    aposReplay.progress === 25,
    `currentPercent=${aposReplay.progress}`
  );

  // --- 3. Falha intermediária: nada pela metade ----------------------------
  // Valor bruto inválido reprova DEPOIS que a transação já leu ticket, contrato,
  // pagamentos e medições. Na versão artesanal, um erro nesse ponto podia deixar
  // o pagamento gravado e a medição não.
  const antesFalha = await readState();
  const falha = await runCommand(
    token,
    commandBody({
      key: 'tx-falha-001',
      paymentId: 'pay-tx-2',
      measurementId: 'meas-tx-2',
      grossValue: 'R$ 0,00',
    })
  );
  const aposFalha = await readState();
  check('valor inválido é rejeitado', falha.status >= 400, `HTTP ${falha.status}`);
  check(
    'falha não gravou pagamento nem medição',
    aposFalha.payments === antesFalha.payments && aposFalha.measurements === antesFalha.measurements,
    `payments=${aposFalha.payments} measurements=${aposFalha.measurements}`
  );
  check(
    'falha não moveu o progresso da OS',
    aposFalha.progress === antesFalha.progress,
    `currentPercent=${aposFalha.progress}`
  );

  // --- 4. Sem baseline: rejeita antes de gravar qualquer coisa -------------
  await resetFixture({ withContract: false });
  const semBaseline = await runCommand(
    token,
    commandBody({
      key: 'tx-sem-baseline',
      paymentId: 'pay-tx-3',
      measurementId: 'meas-tx-3',
      grossValue: 'R$ 10.000,00',
    })
  );
  const aposSemBaseline = await readState();
  check('sem valor previsto da obra é rejeitado', semBaseline.status >= 400, `HTTP ${semBaseline.status}`);
  check(
    'nada gravado quando não há baseline',
    aposSemBaseline.payments === 0 && aposSemBaseline.measurements === 0,
    `payments=${aposSemBaseline.payments} measurements=${aposSemBaseline.measurements}`
  );

  // --- 5. Concorrência: dois lançamentos simultâneos acumulam certo -------
  // O percentual é recalculado DENTRO da transação a partir das medições
  // persistidas; sem isso, o segundo comando sobrescreveria o primeiro
  // (lost update) e a obra registraria menos progresso do que foi medido.
  await resetFixture();
  const [a, b] = await Promise.all([
    runCommand(
      token,
      commandBody({
        key: 'tx-conc-a',
        paymentId: 'pay-conc-a',
        measurementId: 'meas-conc-a',
        grossValue: 'R$ 20.000,00',
      })
    ),
    runCommand(
      token,
      commandBody({
        key: 'tx-conc-b',
        paymentId: 'pay-conc-b',
        measurementId: 'meas-conc-b',
        grossValue: 'R$ 30.000,00',
      })
    ),
  ]);
  const aposConc = await readState();
  const aceitos = [a, b].filter(res => res.status === 200);
  const recusados = [a, b].filter(res => res.status !== 200);

  // Sob contenção o emulador aborta a transação perdedora com "Transaction is
  // invalid or closed" (em produção o SDK retenta com backoff). Por isso NÃO se
  // exige que as duas passem: o que o teste garante é que a perdedora não deixa
  // rastro e que o total persistido bate com o progresso — a invariante que a
  // versão artesanal quebrava.
  check('ao menos um lançamento concorrente foi aceito', aceitos.length >= 1, `aceitos=${aceitos.length}`);
  check(
    'cada aceito virou exatamente 1 pagamento + 1 medição (recusado não deixa rastro)',
    aposConc.payments === aceitos.length && aposConc.measurements === aceitos.length,
    `aceitos=${aceitos.length} payments=${aposConc.payments} measurements=${aposConc.measurements}`
  );

  const brutoPersistido = aceitos.reduce(
    (soma, res) => soma + Number(String(res.json?.measurement?.grossValue || '').replace(/\D/g, '')) / 100,
    0
  );
  const progressoEsperado = Math.round((brutoPersistido / 100000) * 100);
  check(
    'progresso = SOMA do que foi persistido (sem lost update)',
    aposConc.progress === progressoEsperado,
    `currentPercent=${aposConc.progress} esperado=${progressoEsperado} (bruto ${brutoPersistido} de 100000)`
  );
  if (recusados.length > 0) {
    console.log(
      `      nota: ${recusados.length} recusado(s) por contenção do emulador — HTTP ${recusados
        .map(res => res.status)
        .join(',')}. Em produção o SDK retenta; o ideal seria mapear contenção para 409.`
    );
  }

  await deleteSubcollections();
  await ticketRef.delete();

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('FALHOU  erro inesperado —', error);
  process.exit(1);
});
