import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { estadoDaOs, ESTADO } from '../../api/_lib/estadoDaOs.js';

/**
 * TESTE DE CONTRATO DA OS — nenhuma data aninhada escapa crua para a tela.
 *
 * Irmão do `contrato-compromissos`, e aqui a rota é a mais usada do sistema: cada
 * carregamento de tela passa por ela, e o documento é o mais aninhado que existe —
 * `marcos` é um MAPA de datas, `history` é um array de objetos com data dentro, e
 * mais uma dúzia de blocos com data.
 *
 * O serializador de tickets é o cuidadoso: converte cada campo por nome, e os
 * comentários dele já descrevem a falha ("chegaria como Timestamp e o front
 * compararia objeto com data"). Este teste existe para que ele CONTINUE assim.
 *
 * ⚠️ A ASSERÇÃO PRINCIPAL É GENÉRICA, e não campo a campo. Ela varre o documento
 * inteiro procurando qualquer `{_seconds}` sobrevivente. Campo a campo só protege
 * o que já existe hoje; a varredura protege o campo que alguém acrescentar daqui a
 * seis meses e esquecer de serializar — que é exatamente como o defeito das
 * cobranças nasceu.
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

const ID = 'OS-CONTRATO-TESTE';
const dias = d => Timestamp.fromDate(new Date(Date.now() + d * 24 * 60 * 60 * 1000));

/**
 * Um `Timestamp` em cada lugar aninhado que o serializador conhece. Se um deles
 * deixar de ser convertido, a varredura abaixo aponta o caminho exato.
 */
async function semear() {
  await db.collection('tickets').doc(ID).delete().catch(() => {});
  await db
    .collection('tickets')
    .doc(ID)
    .set({
      subject: 'Contrato — OS de teste',
      status: 'Aguardando Orçamento',
      sede: 'DL',
      siteId: 'site-dl',
      priority: 'Moderado',
      time: dias(-10),
      updatedAt: dias(-1),
      stageEnteredAt: dias(-5),
      lastInboundAt: dias(-2),
      lastOutboundAt: dias(-3),
      // `closedAt` na semente de propósito: ele só existe em OS encerrada, e sem
      // isto o teste dependia de outro script ter fechado alguma antes — passava ou
      // falhava conforme a ordem da cadeia.
      closedAt: dias(-1),
      // MAPA de datas — uma por etapa.
      marcos: { 'Nova OS': dias(-10), 'Aguardando Orçamento': dias(-5) },
      // ARRAY de objetos com data dentro.
      history: [
        { id: 'h1', type: 'customer', sender: 'Sede', time: dias(-10), text: 'Abertura', visibility: 'public' },
        { id: 'h2', type: 'system', sender: 'Sistema', time: dias(-5), text: 'Etapa alterada', visibility: 'internal' },
      ],
      nextAction: { what: 'Cobrar o orçamento', dueAt: dias(1), createdAt: dias(-4), ownerName: 'Gestor E2E' },
      // Suspensão vigente: é ela que o `estadoDaOs` lê, e o comentário do
      // serializador avisa que sem converter "a suspensão nunca venceria".
      attention: { state: 'suspensa', reason: 'sem-verba', note: 'Aguardando verba', reviewAt: dias(9), setAt: dias(-1) },
      responsible: { name: 'Gestor E2E', setAt: dias(-4) },
      sla: { dueAt: dias(3) },
      guarantee: { startAt: dias(-30), endAt: dias(60) },
      preliminaryActions: { materialEta: dias(2), plannedStartAt: dias(4), actualStartAt: null, updatedAt: dias(-1) },
    });
}

/**
 * Procura `Timestamp` cru em qualquer profundidade e devolve o CAMINHO de cada um.
 * O caminho é o que transforma "algo escapou" em "conserte esta linha".
 */
function acharTimestampCru(valor, caminho = '', achados = []) {
  if (!valor || typeof valor !== 'object') return achados;
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => acharTimestampCru(item, `${caminho}[${i}]`, achados));
    return achados;
  }
  const temSegundos = typeof valor._seconds === 'number' || typeof valor.seconds === 'number';
  const temNanos = typeof valor._nanoseconds === 'number' || typeof valor.nanoseconds === 'number';
  if (temSegundos && temNanos) {
    achados.push(caminho || '(raiz)');
    return achados;
  }
  for (const [chave, dentro] of Object.entries(valor)) {
    acharTimestampCru(dentro, caminho ? `${caminho}.${chave}` : chave, achados);
  }
  return achados;
}

async function main() {
  await semear();
  const token = await signIn('admin@test.local');

  const res = await fetch(`${API}/api/tickets`, { headers: { authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  check('a rota de OS responde 200', res.status === 200, `HTTP ${res.status}`);

  const lista = Array.isArray(json.tickets) ? json.tickets : [];
  const alvo = lista.find(item => item.id === ID);
  check('a OS semeada volta na resposta', Boolean(alvo), `${lista.length} na lista`);
  if (!alvo) {
    console.log('\n=== abortado: sem a OS não há contrato a verificar ===');
    return 1;
  }

  // ── A ASSERÇÃO QUE PROTEGE O FUTURO.
  const crus = acharTimestampCru(alvo);
  check(
    'NENHUMA data escapa como Timestamp cru, em nenhuma profundidade',
    crus.length === 0,
    crus.length ? `escaparam: ${crus.join(', ')}` : 'documento inteiro varrido'
  );

  // A mesma varredura na lista INTEIRA: OS antiga do banco tem campo que a de teste
  // não tem, e é nela que um serializador esquecido aparece primeiro.
  const crusNaLista = lista.flatMap(t => acharTimestampCru(t).map(p => `${t.id}:${p}`));
  check(
    'e nenhuma escapa nas outras OS da resposta',
    crusNaLista.length === 0,
    crusNaLista.length ? crusNaLista.slice(0, 6).join(', ') : `${lista.length} OS varridas`
  );

  // ── O FORMATO dos dois casos mais traiçoeiros: mapa e array de objetos.
  const marcoIso = alvo.marcos?.['Nova OS'];
  check(
    'marcos é um MAPA de strings ISO, não de objetos',
    typeof marcoIso === 'string' && !Number.isNaN(Date.parse(marcoIso)),
    JSON.stringify(alvo.marcos)
  );
  const tempoDoHistorico = Array.isArray(alvo.history) ? alvo.history[0]?.time : null;
  check(
    'history[].time chega como string ISO',
    typeof tempoDoHistorico === 'string' && !Number.isNaN(Date.parse(tempoDoHistorico)),
    JSON.stringify(tempoDoHistorico)
  );

  // ── O CONSUMIDOR REAL. O comentário do serializador diz, em voz alta, que sem
  // converter `attention.reviewAt` "a suspensão nunca venceria". Aqui isso vira
  // asserção: a revisão está 9 dias no futuro, então a OS tem de estar ESPERANDO.
  // Com o Timestamp cru, `paraData` devolve null e o estado vira IMPEDIDA.
  const estado = estadoDaOs(alvo, new Date());
  check(
    'estadoDaOs lê a suspensão e a devolve como ESPERANDO (revisão no futuro)',
    estado === ESTADO.ESPERANDO,
    `estado=${estado}`
  );

  await db.collection('tickets').doc(ID).delete().catch(() => {});

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  return falhas > 0 ? 1 : 0;
}

/**
 * `db.terminate()` antes de sair, e `exitCode` em vez de `process.exit()`: sair com
 * o cliente do Firestore aberto derruba o Node no encerramento, e o script sai 127
 * DEPOIS de imprimir OK — vermelho sem defeito, que ensina a reexecutar sem ler.
 */
main()
  .then(async codigo => {
    await db.terminate().catch(() => {});
    process.exitCode = codigo;
  })
  .catch(async error => {
    console.error('FALHOU  erro inesperado —', error);
    await db.terminate().catch(() => {});
    process.exitCode = 1;
  });
