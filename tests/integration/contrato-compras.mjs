import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * TESTE DE CONTRATO DE COMPRAS — a rota onde data errada não deixa a tela feia,
 * deixa o NÚMERO errado.
 *
 * Aqui o contrato é diferente dos outros dois, e é isso que ele precisa travar:
 * `readProcurement` espalha o documento CRU (`{ id, ...doc.data() }`), sem
 * serializar nenhuma data. Todas as datas de contrato, pagamento, cotação e medição
 * chegam ao navegador como `{_seconds, _nanoseconds}`.
 *
 * Funciona — porque `procurementApi.ts` hidrata do outro lado, com `coerceDate`.
 * Mas ele hidrata SÓ ALGUNS campos, e nada em lugar nenhum dizia quais. A lista
 * abaixo é essa resposta, verificada contra a resposta real da rota.
 *
 * ⚠️ POR QUE ISSO IMPORTA MAIS AQUI. O painel financeiro faz
 * `payment.paidAt instanceof Date` em dois lugares (KpiView linhas 202 e 788) para
 * montar o desembolso por mês. `instanceof Date` só é verdade porque o hidratador
 * rodou. No dia em que alguém acrescentar um campo de data e esquecer de hidratá-lo,
 * a checagem devolve falso em silêncio e o gráfico some — sem erro, sem log, sem
 * nada na tela dizendo que faltou. É o mesmo desenho do defeito das cobranças.
 *
 * Este teste falha ANTES disso: qualquer data que chegue crua num caminho fora da
 * lista conhecida acusa, com o caminho exato.
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

/**
 * Datas que o cliente CONVERTE (`procurementApi.ts`). Estas podem chegar cruas com
 * segurança — e quem depende de `instanceof Date` depende destas.
 */
const HIDRATADOS = new Set([
  'paymentsByTicket.*[].paidAt',
  'paymentsByTicket.*[].dueAt',
  'paymentsByTicket.*[].attachments[].uploadedAt',
  'measurementsByTicket.*[].requestedAt',
  'measurementsByTicket.*[].approvedAt',
  'measurementsByTicket.*[].attachments[].uploadedAt',
]);

/**
 * Datas que chegam cruas e FICAM cruas — porque nenhuma tela as lê como data.
 *
 * ⚠️ Isto é dívida declarada, não aprovação. Cada linha aqui é uma data que vira
 * `Invalid Date` no dia em que alguém escrever `new Date(contrato.createdAt)`. Se
 * for usar uma delas, o certo é tirá-la desta lista e pôr no hidratador — e este
 * teste é quem lembra disso.
 */
const CRUS_TOLERADOS = new Set([
  'contractsByTicket.*.createdAt',
  'contractsByTicket.*.updatedAt',
  'contractsByTicket.*.approvedAt',
  'paymentsByTicket.*[].createdAt',
  'paymentsByTicket.*[].updatedAt',
  'paymentsByTicket.*[].submittedAt',
  'quotesByTicket.*[].createdAt',
  'quotesByTicket.*[].updatedAt',
  'measurementsByTicket.*[].createdAt',
]);

const TICKET = 'OS-0001';
const dias = d => Timestamp.fromDate(new Date(Date.now() + d * 24 * 60 * 60 * 1000));
const DOCS = [
  ['contracts', 'contrato-de-contrato'],
  ['payments', 'pagamento-de-contrato'],
  ['quotes', 'cotacao-de-contrato'],
  ['measurements', 'medicao-de-contrato'],
];

async function semear() {
  const t = db.collection('tickets').doc(TICKET);
  await limpar();
  await t.collection('contracts').doc('contrato-de-contrato').set({
    ticketId: TICKET, vendor: 'Fornecedor Contrato', totalValue: '1000',
    createdAt: dias(-9), updatedAt: dias(-1), approvedAt: dias(-8),
  });
  await t.collection('payments').doc('pagamento-de-contrato').set({
    ticketId: TICKET, status: 'paid', value: '500',
    paidAt: dias(-3), dueAt: dias(2), createdAt: dias(-5),
    attachments: [{ id: 'a1', name: 'nota.pdf', path: 'x/y', uploadedAt: dias(-3) }],
  });
  await t.collection('quotes').doc('cotacao-de-contrato').set({
    ticketId: TICKET, vendor: 'Fornecedor Contrato', value: '900',
    createdAt: dias(-12), updatedAt: dias(-11),
  });
  await t.collection('measurements').doc('medicao-de-contrato').set({
    ticketId: TICKET, percent: 50, requestedAt: dias(-6), approvedAt: dias(-4),
    createdAt: dias(-6),
    // COM anexo de propósito: sem ele o caminho `attachments[].uploadedAt` não
    // aparece, e a asserção de cobertura não teria o que conferir.
    attachments: [{ id: 'm1', name: 'medicao.pdf', path: 'x/z', uploadedAt: dias(-4) }],
  });
}

async function limpar() {
  const t = db.collection('tickets').doc(TICKET);
  for (const [col, id] of DOCS) await t.collection(col).doc(id).delete().catch(() => {});
}

/** Caminho estável: some com o id da OS e com o índice do array. */
function normalizar(caminho) {
  return caminho
    .replace(/^(\w+ByTicket)\.[^.[]+/, '$1.*')
    .replace(/\[\d+\]/g, '[]');
}

function acharTimestampCru(valor, caminho = '', achados = []) {
  if (!valor || typeof valor !== 'object') return achados;
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => acharTimestampCru(item, `${caminho}[${i}]`, achados));
    return achados;
  }
  const seg = typeof valor._seconds === 'number' || typeof valor.seconds === 'number';
  const nano = typeof valor._nanoseconds === 'number' || typeof valor.nanoseconds === 'number';
  if (seg && nano) {
    achados.push(caminho);
    return achados;
  }
  for (const [chave, dentro] of Object.entries(valor)) {
    acharTimestampCru(dentro, caminho ? `${caminho}.${chave}` : chave, achados);
  }
  return achados;
}

/** O que `coerceDate` do cliente sabe ler. É este o contrato mínimo. */
function coerceDateAceita(valor) {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === 'string') return !Number.isNaN(Date.parse(valor));
  if (typeof valor === 'number') return Number.isFinite(valor);
  if (typeof valor === 'object') {
    return typeof valor.seconds === 'number' || typeof valor._seconds === 'number';
  }
  return false;
}

async function main() {
  await semear();
  const token = await signIn('admin@test.local');

  const res = await fetch(`${API}/api/procurement`, { headers: { authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  check('a rota de compras responde 200', res.status === 200, `HTTP ${res.status}`);

  const pagamento = (json.paymentsByTicket?.[TICKET] || []).find(p => p.id === 'pagamento-de-contrato');
  check('o pagamento semeado volta na resposta', Boolean(pagamento), JSON.stringify(Object.keys(json)));
  if (!pagamento) {
    console.log('\n=== abortado: sem o pagamento não há contrato a verificar ===');
    return 1;
  }

  // ── O CAMPO DO QUAL O PAINEL FINANCEIRO DEPENDE.
  check(
    'paidAt chega numa forma que o coerceDate do cliente sabe ler',
    coerceDateAceita(pagamento.paidAt),
    JSON.stringify(pagamento.paidAt)
  );
  check(
    'dueAt também',
    coerceDateAceita(pagamento.dueAt),
    JSON.stringify(pagamento.dueAt)
  );

  // ── A ASSERÇÃO QUE TRAVA A ASSIMETRIA.
  const crus = [];
  for (const colecao of ['contractsByTicket', 'paymentsByTicket', 'quotesByTicket', 'measurementsByTicket']) {
    crus.push(...acharTimestampCru(json[colecao], colecao));
  }
  const desconhecidos = [
    ...new Set(crus.map(normalizar).filter(p => !HIDRATADOS.has(p) && !CRUS_TOLERADOS.has(p))),
  ];
  check(
    'nenhuma data crua em caminho DESCONHECIDO (se falhar: hidrate em procurementApi.ts)',
    desconhecidos.length === 0,
    desconhecidos.length ? desconhecidos.join(', ') : `${crus.length} datas cruas, todas previstas`
  );

  // ── E o inverso: se um caminho HIDRATADO parar de aparecer, o hidratador ficou
  // apontando para campo que não existe mais — silencioso do mesmo jeito.
  const presentes = new Set(crus.map(normalizar));
  const hidratadosAusentes = [...HIDRATADOS].filter(p => !presentes.has(p));
  check(
    'todo caminho que o cliente hidrata ainda existe na resposta',
    hidratadosAusentes.length === 0,
    hidratadosAusentes.length ? `sumiram: ${hidratadosAusentes.join(', ')}` : `${HIDRATADOS.size} conferidos`
  );

  await limpar();

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  return falhas > 0 ? 1 : 0;
}

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
