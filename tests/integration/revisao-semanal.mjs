import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * A REVISÃO SEMANAL — a quarta porta sem login, e a mais destrutiva das quatro.
 *
 * Uma vez por semana a gestora recebe a lista das OS paradas há mais de 30 dias e
 * responde ali mesmo: encerrar, ainda pendente, ver depois. É o único link por
 * e-mail do sistema que ENCERRA OS.
 *
 * ⚠️ O QUE PRECISA SER PROVADO AQUI É O LIMITE DO TOKEN. Ele carrega a lista de OS
 * daquele lote, e a rota recusa qualquer id fora dela. Sem essa checagem, quem
 * tivesse o link — e ele viaja por e-mail, é encaminhado, fica na caixa de quem
 * quer que seja — encerraria QUALQUER OS do sistema mandando outro id no corpo.
 *
 * ⚠️ E O ENCERRAMENTO PRECISA SER COMPLETO. A auditoria (consulta 13) pegou esta
 * rota mudando só o `status`: sem `closedAt`, `stageEnteredAt` e `marcos`, a OS
 * some do gráfico de encerramentos. Foi exatamente assim que 92 de 92 OS fechadas
 * apareceram como zero, por meses, sem ninguém notar. Uma limpeza que não aparece
 * no indicador que ela existe para mover não serve para nada.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const API = 'http://127.0.0.1:3001';

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const NO_LOTE = 'OS-REVISAO-NO-LOTE';
const FORA_DO_LOTE = 'OS-REVISAO-FORA-DO-LOTE';
const TOKEN = 'token-revisao-de-teste';
const dias = d => Timestamp.fromDate(new Date(Date.now() + d * 24 * 60 * 60 * 1000));

const os = extra => ({
  subject: 'OS parada há muito tempo',
  status: 'Aguardando Orçamento',
  sede: 'DL',
  priority: 'Moderado',
  time: dias(-90),
  updatedAt: dias(-45),
  stageEnteredAt: dias(-45),
  ...extra,
});

async function limpar() {
  for (const id of [NO_LOTE, FORA_DO_LOTE]) await db.collection('tickets').doc(id).delete().catch(() => {});
  await db.collection('revisaoTokens').doc(TOKEN).delete().catch(() => {});
}

async function semear({ criadoEm = new Date() } = {}) {
  await limpar();
  await db.collection('tickets').doc(NO_LOTE).set(os({ subject: 'Está no lote da revisão' }));
  // Esta NÃO entra no token. É o alvo do ataque que o teste tenta.
  await db.collection('tickets').doc(FORA_DO_LOTE).set(os({ subject: 'NÃO está no lote' }));
  await db.collection('revisaoTokens').doc(TOKEN).set({
    email: 'gestora@test.local',
    nome: 'Gestora de Teste',
    ticketIds: [NO_LOTE],
    createdAt: Timestamp.fromDate(criadoEm),
  });
}

const ler = async id => (await db.collection('tickets').doc(id).get()).data() || {};

const responder = (ticketId, resposta, token = TOKEN) =>
  fetch(`${API}/api/tickets?route=revisao-pagina`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ticketId, resposta }),
  });

async function main() {
  await semear();

  // ══ O GET não escreve — mesma trava da confirmação, mesmo motivo.
  const antes = await ler(NO_LOTE);
  for (let i = 0; i < 3; i += 1) {
    await fetch(`${API}/api/tickets?route=revisao-pagina&token=${TOKEN}`);
  }
  const depoisDosGets = await ler(NO_LOTE);
  check(
    'três GETs não mudam nenhuma OS',
    depoisDosGets.status === antes.status && !depoisDosGets.closedAt,
    `status=${depoisDosGets.status}`
  );

  const get = await fetch(`${API}/api/tickets?route=revisao-pagina&token=${TOKEN}`);
  const getJson = await get.json().catch(() => ({}));
  check('o GET devolve o lote da gestora', get.status === 200 && Array.isArray(getJson.ordens), `HTTP ${get.status}`);
  check(
    'e traz SÓ as OS do lote — não a lista inteira do sistema',
    getJson.ordens?.length === 1 && getJson.ordens[0].id === NO_LOTE,
    JSON.stringify((getJson.ordens || []).map(o => o.id))
  );
  check('com o nome de quem recebeu', getJson.gestora?.email === 'gestora@test.local', JSON.stringify(getJson.gestora));

  // ══ A ASSERÇÃO QUE JUSTIFICA O ARQUIVO: o token é uma coleira.
  const invasao = await responder(FORA_DO_LOTE, 'encerrar');
  const alvo = await ler(FORA_DO_LOTE);
  check(
    'encerrar uma OS FORA do lote é recusado com 403',
    invasao.status === 403,
    `HTTP ${invasao.status}`
  );
  check(
    'e a OS de fora continua exatamente como estava',
    alvo.status === 'Aguardando Orçamento' && !alvo.closedAt,
    `status=${alvo.status} closedAt=${alvo.closedAt || 'null'}`
  );

  // ══ Encerrar de verdade, e COMPLETO.
  const encerrou = await responder(NO_LOTE, 'encerrar');
  const fechada = await ler(NO_LOTE);
  check('encerrar pelo link responde 200', encerrou.status === 200, `HTTP ${encerrou.status}`);
  check('a OS ficou encerrada', String(fechada.status || '').toLowerCase().includes('encerrada'), `status=${fechada.status}`);
  check(
    'com closedAt — sem ele a OS some do gráfico de encerramentos',
    Boolean(fechada.closedAt),
    String(fechada.closedAt)
  );
  check(
    'com stageEnteredAt e o MARCO da etapa — a limpeza precisa aparecer no indicador',
    Boolean(fechada.stageEnteredAt) && Boolean(fechada.marcos?.Encerrada),
    JSON.stringify(Object.keys(fechada.marcos || {}))
  );
  check(
    'e com o AUTOR: quem respondeu fica gravado',
    String(fechada.revisaoRespondidaPor || '') === 'gestora@test.local',
    String(fechada.revisaoRespondidaPor)
  );

  // ══ Desfazer, que é o que torna encerrar seguro.
  const desfez = await responder(NO_LOTE, 'desfazer');
  const reaberta = await ler(NO_LOTE);
  check('desfazer responde 200 dentro da janela', desfez.status === 200, `HTTP ${desfez.status}`);
  check(
    'a OS volta para a etapa anterior',
    reaberta.status === 'Aguardando Orçamento',
    `status=${reaberta.status}`
  );
  check('e o closedAt é limpo — ela não está mais fechada AGORA', !reaberta.closedAt, String(reaberta.closedAt));
  check(
    'mas o MARCO de encerramento permanece — o histórico é do que aconteceu',
    Boolean(reaberta.marcos?.Encerrada),
    JSON.stringify(Object.keys(reaberta.marcos || {}))
  );

  // ══ "Ver depois" não pode zerar o tempo parado.
  await semear();
  const antesDeAdiar = await ler(NO_LOTE);
  const adiou = await responder(NO_LOTE, 'ver-depois');
  const adiada = await ler(NO_LOTE);
  check('adiar responde 200', adiou.status === 200, `HTTP ${adiou.status}`);
  check('e marca a data de voltar', Boolean(adiada.revisaoAdiadaAte), String(adiada.revisaoAdiadaAte));
  /**
   * ⚠️ O RELÓGIO DA ESTAGNAÇÃO É `stalledSince`, NÃO `updatedAt` — e minha primeira
   * versão deste teste afirmou o campo errado.
   *
   * Adiar É uma alteração e mexe em `updatedAt` de propósito: esconder a escrita foi
   * um erro que a auditoria já apontou. O que não pode zerar é o tempo parado, que
   * mora à parte justamente para o adiamento não apagar a evidência de postergação.
   */
  const marco = v => String(v?.toMillis?.() ?? v ?? '');
  check(
    'o tempo parado é preservado — adiar é esperar, não é trabalhar',
    marco(adiada.stalledSince) === marco(antesDeAdiar.updatedAt),
    `stalledSince=${adiada.stalledSince?.toDate?.().toISOString?.()} atividade anterior=${antesDeAdiar.updatedAt?.toDate?.().toISOString?.()}`
  );
  check(
    'e o adiamento fica CONTADO — postergar duas vezes não pode ser invisível',
    Number(adiada.adiamentos || 0) === 1,
    `adiamentos=${adiada.adiamentos}`
  );

  // ══ Resposta que não existe.
  const inventada = await responder(NO_LOTE, 'resposta-inventada');
  check('resposta desconhecida é recusada', inventada.status === 400, `HTTP ${inventada.status}`);

  // ══ Token vencido: uma SEMANA, porque o e-mail é semanal.
  await semear({ criadoEm: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
  const vencido = await fetch(`${API}/api/tickets?route=revisao-pagina&token=${TOKEN}`);
  const inexistente = await fetch(`${API}/api/tickets?route=revisao-pagina&token=nunca-existiu`);
  check('token de 8 dias já não vale', vencido.status === 410, `HTTP ${vencido.status}`);
  check(
    'e responde igual ao inexistente — não conta que já existiu',
    inexistente.status === vencido.status,
    `inexistente=${inexistente.status}`
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
