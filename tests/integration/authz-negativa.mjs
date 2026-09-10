import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
// O extrator que os testes de PDF já usam, importado como está: o Node 24 remove as
// anotações de tipo sozinho. Copiar as ~60 linhas dele para cá seria um segundo
// extrator, e o dia em que o pdfkit mudar de codificação só um dos dois é corrigido.
import { textoDoPdf } from '../pdfTexto.ts';

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

  // --- O PDF QUE CIRCULA respeita o TERRITORIO ------------------------------
  //
  // O papel ja e conferido (Admin+Gestor, na matriz). O que se afirma aqui e o
  // segundo portao: uma rota que nasce sem `canUserAccessTicket` entrega, num
  // arquivo pronto para circular, uma OS que a pessoa nao consegue nem abrir na
  // tela. Aconteceu neste repositorio — a rota de compromissos nasceu assim.
  //
  // ⚠️ ESTE BLOCO APONTAVA PARA `?route=ticket-pdf`, REMOVIDA EM 31/08 (6fa8f00,
  // "o retrato de uma OS em PDF, superado pela Lista"). A rota sumiu e o teste
  // ficou: como rota desconhecida cai no handler generico de tickets, ele recebia
  // 200 com a LISTA DE OS em JSON e reprovava por "nao e um PDF" — barulho que
  // escondia o que ele existe para vigiar. Repontado para `lista-pdf`, que e o
  // documento que circula hoje, e cuja protecao territorial nao tinha teste nenhum.
  //
  // ⚠️ E A LISTA NAO RECUSA COM 403 — ela CORTA. O corpo vem do cliente (as linhas
  // que estao na tela), entao o servidor nao pode confiar nele: confere OS a OS e
  // deixa de fora o que nao e daquela pessoa. Afirmar 403 aqui seria afirmar um
  // comportamento que a rota nunca teve.
  //
  // O Gestor do E2E esta vinculado a universidade/PQL3. OS-0003 e da regiao-sul.
  const linhaDaOs = id => [id, `Assunto de ${id}`, 'SEDE', 'Servico', 'Equipe', 'Alguem', 'Em analise', '1/6', '3 dias'];

  async function listaEmPdf(token) {
    const res = await fetch(`${API}/api/tickets?route=lista-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        linhas: [linhaDaOs('OS-0001'), linhaDaOs('OS-0003')],
        filtros: {},
        total: 2,
      }),
    });
    return { status: res.status, corpo: Buffer.from(await res.arrayBuffer()) };
  }

  // O primeiro portao, o do PAPEL. Mora aqui e nao na matriz porque a matriz sonda
  // com GET, e o GET desta rota responde 405 antes de olhar o papel — a linha diria
  // "todos passaram" sem ter medido nada.
  for (const [email, papel] of [['usuario.pe@test.local', 'Usuario'], ['diretor.e2e@test.local', 'Diretor']]) {
    const recusa = await listaEmPdf(await signIn(email));
    check(
      `${papel} NAO gera a lista em PDF`,
      recusa.status === 403,
      `HTTP ${recusa.status}`
    );
    check(
      `a recusa para ${papel} nao devolve documento nenhum`,
      recusa.corpo.subarray(0, 5).toString('latin1') !== '%PDF-',
      recusa.corpo.subarray(0, 60).toString('latin1')
    );
  }

  const doGestor = await listaEmPdf(await signIn('gestor.e2e@test.local'));
  check(
    'a lista em PDF volta um documento de verdade para o Gestor',
    doGestor.status === 200
      && doGestor.corpo.subarray(0, 5).toString('latin1') === '%PDF-'
      && doGestor.corpo.length > 1000,
    `HTTP ${doGestor.status}, ${doGestor.corpo.length} bytes`
  );

  const textoDoGestor = textoDoPdf(doGestor.corpo);
  check(
    'a OS da sede do Gestor (PQL3) esta no papel',
    textoDoGestor.includes('OS-0001'),
    textoDoGestor.slice(0, 120)
  );
  check(
    'a OS de outra regiao (SUL3) NAO esta no papel, mesmo pedida no corpo',
    !textoDoGestor.includes('OS-0003')
  );
  check(
    'e o documento DECLARA o corte, em vez de calar',
    /fora do seu territ/i.test(textoDoGestor),
    textoDoGestor.slice(0, 200)
  );

  // ⚠️ O CONTROLE QUE IMPEDE O TESTE DE PASSAR A TOA. Sem ele, "OS-0003 nao aparece"
  // passaria tambem se o PDF viesse vazio, ou se o extrator lesse errado.
  const doAdmin = await listaEmPdf(await signIn('admin@test.local'));
  const textoDoAdmin = textoDoPdf(doAdmin.corpo);
  check(
    'controle: para o Admin as DUAS aparecem — a ausencia acima e o territorio, nao o extrator',
    textoDoAdmin.includes('OS-0001') && textoDoAdmin.includes('OS-0003'),
    textoDoAdmin.slice(0, 200)
  );

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('FALHOU  erro inesperado —', error);
  process.exit(1);
});
