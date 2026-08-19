import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { novoTokenDeConfirmacao } from '../../api/_lib/visitConfirm.js';

/**
 * O LINK QUE A SEDE CLICA NO E-MAIL — a terceira porta sem login.
 *
 * `api/tickets?route=confirm-visit`. O módulo puro (`visitConfirm.js`) já tem
 * unitários; o que não tinha teste é a ROTA, e é nela que moram as decisões que
 * custam caro.
 *
 * ⚠️ A PRIMEIRA ASSERÇÃO É A QUE MAIS IMPORTA: **o GET não escreve**. Filtro de
 * segurança de e-mail corporativo ABRE OS LINKS SOZINHO para checar se são seguros
 * — e a Christus usa um. Se o botão do e-mail gravasse direto, o sistema
 * registraria "não apareceu" em visitas que ninguém olhou, e cobraria fornecedor
 * que compareceu.
 *
 * Isso não é hipótese: é o motivo de a rota ter sido desenhada em duas etapas, o
 * e-mail abrindo a página e a página gravando no POST. Um teste que não prova essa
 * separação não está testando esta rota.
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

const VISITA = 'cmt-confirmacao-teste';
const horas = h => new Date(Date.now() + h * 60 * 60 * 1000);

async function limpar() {
  await db.collection('commitments').doc(VISITA).delete().catch(() => {});
  const tokens = await db.collection('visitConfirmTokens').where('commitmentId', '==', VISITA).get();
  await Promise.all(tokens.docs.map(d => d.ref.delete()));
}

/** Uma visita marcada para 2h atrás, ainda sem resposta da sede. */
async function semear({ criadoEm = new Date() } = {}) {
  await limpar();
  await db.collection('commitments').doc(VISITA).set({
    kind: 'visita-fornecedor',
    ticketIds: ['OS-0001'],
    sede: 'DL',
    vendorName: 'Elétrica de Teste',
    startAt: Timestamp.fromDate(horas(-2)),
    state: 'agendado',
    outcome: null,
    createdAt: Timestamp.fromDate(horas(-48)),
  });

  const token = novoTokenDeConfirmacao({
    commitmentId: VISITA,
    email: 'sede.dl@test.local',
    nome: 'Coordenadora DL',
    now: criadoEm,
  });
  // `novoTokenDeConfirmacao` devolve { token, doc }: o que vai para o banco é o
  // `doc`. Gravar o objeto inteiro cria um token sem `commitmentId` — foi o que eu
  // fiz na primeira versão, e a rota devolveu 500 em vez de 410.
  await db.collection('visitConfirmTokens').doc(token.token).set({
    ...token.doc,
    createdAt: Timestamp.fromDate(criadoEm),
  });
  return token.token;
}

const lerEstado = async () => (await db.collection('commitments').doc(VISITA).get()).data() || {};

async function main() {
  const token = await semear();

  // ══ A TRAVA. Cinco GETs, como um varredor de e-mail faria.
  const antes = await lerEstado();
  for (let i = 0; i < 5; i += 1) {
    await fetch(`${API}/api/tickets?route=confirm-visit&token=${encodeURIComponent(token)}`);
  }
  const depois = await lerEstado();
  check(
    'cinco GETs (como um varredor de e-mail) NÃO mudam nada',
    depois.state === antes.state && !depois.confirmedAt && !depois.outcome,
    `state=${depois.state} confirmedAt=${depois.confirmedAt || 'null'}`
  );

  const get = await fetch(`${API}/api/tickets?route=confirm-visit&token=${encodeURIComponent(token)}`);
  const getJson = await get.json().catch(() => ({}));
  check('o GET devolve a pergunta para a página montar', get.status === 200 && Boolean(getJson.pergunta), `HTTP ${get.status}`);
  // As OPÇÕES são montadas na página, a partir do enum `ESCOLHA` — a rota entrega o
  // CONTEXTO. Aqui se afirma o que a sede precisa ver para responder sem abrir o
  // sistema: qual sede, qual fornecedor, para quando era, e se já foi respondida.
  const p = getJson.pergunta || {};
  check(
    'e traz o contexto que a sede precisa para decidir',
    p.sede === 'DL' && p.fornecedor === 'Elétrica de Teste' && Boolean(p.marcadoPara) && p.jaRespondido === false,
    JSON.stringify({ sede: p.sede, fornecedor: p.fornecedor, jaRespondido: p.jaRespondido })
  );
  check(
    'e diz a QUEM o link foi enviado — cada pessoa tem o seu',
    p.convidado?.email === 'sede.dl@test.local',
    JSON.stringify(p.convidado)
  );

  // ══ O POST grava.
  const responder = (escolha, tk = token) =>
    fetch(`${API}/api/tickets?route=confirm-visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tk, escolha }),
    });

  const post = await responder('nao-apareceu');
  check('o POST responde 200', post.status === 200, `HTTP ${post.status}`);
  const registrado = await lerEstado();
  check('e AGORA sim a visita ficou como falta', registrado.state === 'faltou', `state=${registrado.state}`);
  check(
    'com o registro de QUEM respondeu — o token é por pessoa',
    String(registrado.confirmedBy || '') === 'sede.dl@test.local' ||
      (registrado.confirmationEvents || []).some(e => String(e.por || '') === 'sede.dl@test.local'),
    JSON.stringify(registrado.confirmedBy || registrado.confirmationEvents)
  );
  check(
    'e a origem gravada diz que veio do link da sede',
    String(registrado.confirmedVia || '') === 'link-da-sede',
    String(registrado.confirmedVia)
  );

  // ══ Responder de novo não sobrescreve em silêncio.
  const denovo = await responder('chegou');
  const depoisDoSegundo = await lerEstado();
  check(
    'responder duas vezes é recusado com 409, não aceito calado',
    denovo.status === 409,
    `HTTP ${denovo.status}`
  );
  check('e o estado original permanece', depoisDoSegundo.state === 'faltou', `state=${depoisDoSegundo.state}`);

  // ══ Escolha que não existe.
  await semear();
  const inventada = await responder('escolha-inventada', (await db.collection('visitConfirmTokens').where('commitmentId', '==', VISITA).get()).docs[0].id);
  check('escolha desconhecida é recusada', inventada.status === 400, `HTTP ${inventada.status}`);

  // ══ Token que não existe e token vencido respondem IGUAL.
  const inexistente = await fetch(`${API}/api/tickets?route=confirm-visit&token=token-que-nunca-existiu`);
  const vencidoTk = await semear({ criadoEm: horas(-96) });
  const vencido = await fetch(`${API}/api/tickets?route=confirm-visit&token=${encodeURIComponent(vencidoTk)}`);
  check(
    'token inexistente e token vencido devolvem a MESMA resposta',
    inexistente.status === vencido.status && inexistente.status === 410,
    `inexistente=${inexistente.status} vencido=${vencido.status}`
  );
  // Distinguir os dois diria a quem varre que aquele token um dia existiu.
  const [ti, tv] = [await inexistente.json().catch(() => ({})), await vencido.json().catch(() => ({}))];
  check(
    'e a mensagem é a mesma — não conta a quem varre que o token já existiu',
    String(ti.error || '') === String(tv.error || ''),
    `"${ti.error}" vs "${tv.error}"`
  );

  // ══ Sem token nenhum.
  const semToken = await fetch(`${API}/api/tickets?route=confirm-visit`);
  check('link incompleto responde 400', semToken.status === 400, `HTTP ${semToken.status}`);

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
