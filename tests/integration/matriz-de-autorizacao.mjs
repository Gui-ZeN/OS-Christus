import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * A MATRIZ DE AUTORIZAÇÃO — papel × rota × método, GERADA a partir do código.
 *
 * `authz-negativa.mjs` cobre dois casos escolhidos a dedo. O problema de uma lista
 * escrita à mão é que ela envelhece calada: a rota nova de amanhã não está nela, e
 * ninguém percebe que a rota nova de amanhã não está nela.
 *
 * Aqui as rotas saem de uma varredura de `api/*.js`. Rota nova entra na matriz no
 * dia em que é escrita, sem ninguém lembrar de nada.
 *
 * DOIS EIXOS, e o recorte de cada um é deliberado:
 *
 * 1. SEM CREDENCIAL (sem token, e com token forjado) — TODAS as rotas, TODOS os
 *    métodos. É seguro varrer com escrita: se a guarda funciona, nada acontece; se
 *    algo acontecer, é exatamente o defeito que queremos achar.
 *
 * 2. POR PAPEL (Admin, Gestor, Diretor, Usuario) — só GET. Varrer POST/PATCH/DELETE
 *    autenticado como Admin dispararia backfill, migração de anexos e sincronização
 *    do Gmail de verdade. O eixo de papel em escrita é caso a caso, nos testes
 *    dedicados.
 *
 * O QUE A MATRIZ AFIRMA:
 *   a) nenhuma rota responde 2xx sem credencial, fora as públicas justificadas;
 *   b) token forjado nunca vira 2xx;
 *   c) nenhum 500 — travar não é resposta de autorização (foi assim que apareceu o
 *      500 do token malformado no rastreio público);
 *   d) as públicas CONTINUAM públicas — a regressão também vale no outro sentido:
 *      fechar sem querer a porta do solicitante é tão ruim quanto abrir a errada.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();

const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';
const RAIZ_API = join(process.cwd(), 'api');

const results = [];
function check(name, pass, detail = '') {
  results.push({ pass });
  console.log(`${pass ? 'PASS' : 'FALHOU'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// A ENUMERAÇÃO: as rotas vêm do código, não de uma lista.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Todo arquivo em `api/` é um endpoint. Dentro dele o despacho é `route === '...'`
 * lido de `req.query.route` — a convenção nasceu do teto de 12 funções do plano
 * Hobby da Vercel: rota nova entra como `?route=` em arquivo existente.
 *
 * O `''` é a rota base (o arquivo sem `?route=`), que também é um endpoint real.
 */
function enumerarRotas() {
  const arquivos = readdirSync(RAIZ_API).filter(nome => nome.endsWith('.js'));
  const rotas = [];
  for (const arquivo of arquivos) {
    const fonte = readFileSync(join(RAIZ_API, arquivo), 'utf8');
    const encontradas = new Set(['']);
    for (const achado of fonte.matchAll(/route === '([a-z0-9-]+)'/g)) {
      encontradas.add(achado[1]);
    }
    for (const rota of encontradas) {
      rotas.push({ endpoint: arquivo.replace(/\.js$/, ''), rota });
    }
  }
  return rotas.sort((a, b) => `${a.endpoint}${a.rota}`.localeCompare(`${b.endpoint}${b.rota}`));
}

/**
 * PORTAS PÚBLICAS, uma a uma justificada. Qualquer coisa fora desta lista que
 * responda 2xx sem credencial reprova a matriz.
 *
 * A lista é curta de propósito: cada linha aqui é uma porta sem tranca, e o motivo
 * de ela existir tem que caber numa frase.
 */
const PUBLICAS_JUSTIFICADAS = new Map([
  // O formulário público precisa dos dropdowns antes de existir qualquer login.
  // `api/catalog.js:626` faz auth OPCIONAL: anônimo recebe só o necessário para os
  // seletores; autenticado recebe o catálogo inteiro.
  ['catalog:', 'dropdowns do formulário público — auth opcional, payload reduzido'],
  // Links clicados de dentro do e-mail, pelo destinatário, sem login. Os dois são
  // GET que NÃO escreve: varredor de e-mail corporativo pré-carrega link.
  ['tickets:confirm-visit', 'confirmação de visita pelo link do e-mail'],
  ['tickets:revisao-pagina', 'página da revisão semanal pelo link do e-mail'],
  // POST-only: o push do Pub/Sub é autenticado pelo Google, não por usuário nosso.
  ['mail:gmail-push', 'push do Gmail — autenticação é do Google, não nossa'],
]);

/**
 * O rastreio público NÃO entra na lista acima de propósito: ele mora em
 * `GET /api/tickets?tracking=<token>`, e sem o token a mesma rota cai no caminho
 * autenticado e responde 401. É o comportamento certo, e vale afirmar.
 */

const METODOS = ['GET', 'POST', 'PATCH', 'DELETE'];

function urlDe({ endpoint, rota }) {
  return rota ? `${API}/api/${endpoint}?route=${rota}` : `${API}/api/${endpoint}`;
}

async function chamar(alvo, metodo, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(urlDe(alvo), {
      method: metodo,
      headers,
      body: metodo === 'GET' ? undefined : '{}',
      // Uma rota que pendura nao pode travar a varredura inteira: sem prazo, um
      // unico handler lento segura as ~140 combinacoes atras dele.
      signal: AbortSignal.timeout(20000),
    });
    return res.status;
  } catch (error) {
    return `erro-de-rede: ${error.message}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function authCall(path, body) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${path}?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  return res.json();
}

async function contaPara(email) {
  let json = await authCall('signInWithPassword', { email, password: 'Test@123456' });
  if (!json.idToken) json = await authCall('signUp', { email, password: 'Test@123456' });
  return json.idToken ? { idToken: json.idToken, uid: json.localId } : null;
}

const rotas = enumerarRotas();
console.log(`\n── matriz gerada: ${rotas.length} rotas × ${METODOS.length} métodos ──\n`);

// ═════════════════════════════════════════════════════════════════════════════
// EIXO 1 — sem credencial nenhuma
// ═════════════════════════════════════════════════════════════════════════════

const abertasSemCredencial = [];
const travadas = [];

for (const alvo of rotas) {
  const chave = `${alvo.endpoint}:${alvo.rota}`;
  for (const metodo of METODOS) {
    const status = await chamar(alvo, metodo, null);
    if (status === 500) travadas.push(`${metodo} ${chave}`);
    if (typeof status === 'number' && status >= 200 && status < 300) {
      abertasSemCredencial.push({ chave, metodo, status });
    }
  }
}

const inesperadas = abertasSemCredencial.filter(item => !PUBLICAS_JUSTIFICADAS.has(item.chave));

check(
  'nenhuma rota responde 2xx sem credencial (fora as públicas justificadas)',
  inesperadas.length === 0,
  inesperadas.length ? inesperadas.map(i => `${i.metodo} ${i.chave} → ${i.status}`).join(' | ') : ''
);

check(
  'nenhuma rota trava com 500 sem credencial — travar não é resposta de autorização',
  travadas.length === 0,
  travadas.join(' | ')
);

// ═════════════════════════════════════════════════════════════════════════════
// EIXO 2 — token forjado
// ═════════════════════════════════════════════════════════════════════════════

const TOKEN_FORJADO = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWxzbyJ9.nao-assinado';
const aceitasComForjado = [];
const travadasComForjado = [];

for (const alvo of rotas) {
  const chave = `${alvo.endpoint}:${alvo.rota}`;
  for (const metodo of METODOS) {
    const status = await chamar(alvo, metodo, TOKEN_FORJADO);
    if (status === 500) travadasComForjado.push(`${metodo} ${chave}`);
    if (typeof status === 'number' && status >= 200 && status < 300 && !PUBLICAS_JUSTIFICADAS.has(chave)) {
      aceitasComForjado.push(`${metodo} ${chave} → ${status}`);
    }
  }
}

check(
  'token forjado nunca vira 2xx',
  aceitasComForjado.length === 0,
  aceitasComForjado.join(' | ')
);

check(
  'token forjado não trava nenhuma rota com 500',
  travadasComForjado.length === 0,
  travadasComForjado.join(' | ')
);

// ═════════════════════════════════════════════════════════════════════════════
// EIXO 3 — as públicas continuam públicas
// ═════════════════════════════════════════════════════════════════════════════

// Fechar sem querer a porta do solicitante é tão ruim quanto abrir a errada: ele
// não tem login, e o link do e-mail é o único caminho dele até a própria OS.
for (const [chave, motivo] of PUBLICAS_JUSTIFICADAS) {
  const [endpoint, rota] = chave.split(':');
  const status = await chamar({ endpoint, rota }, 'GET', null);
  const respondeu = typeof status === 'number' && status !== 401 && status !== 403 && status !== 500;
  check(`porta pública segue aberta: ${chave} (${motivo})`, respondeu, `GET → ${status}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// EIXO 4 — por papel, só leitura
// ═════════════════════════════════════════════════════════════════════════════

const PAPEIS = ['Admin', 'Gestor', 'Diretor', 'Usuario'];

/**
 * ⚠️ O TOKEN NÃO BASTA. `resolveAuthenticatedUser` valida o token no Auth e DEPOIS
 * procura o cadastro em `users` (por `authUid`, senão por e-mail); sem cadastro,
 * 403 "Usuário autenticado sem cadastro no diretório".
 *
 * Sem semear estes documentos, as quatro colunas da matriz saem idênticas — todas
 * 403 — e o teste passa sem testar papel nenhum. Foi exatamente o que aconteceu na
 * primeira execução: quatro colunas iguais em todas as linhas, o sinal de um eixo
 * vazio.
 */
const tokens = {};
const docsSemeados = [];

for (const papel of PAPEIS) {
  const email = `matriz-${papel.toLowerCase()}@px.com.br`;
  const conta = await contaPara(email);
  if (!conta) continue;
  tokens[papel] = conta.idToken;

  const ref = db.collection('users').doc(`matriz-${papel.toLowerCase()}`);
  await ref.set({
    name: `Matriz ${papel}`,
    email,
    role: papel,
    status: 'Ativo',
    active: true,
    authUid: conta.uid,
    regionIds: [],
    siteIds: [],
  });
  docsSemeados.push(ref);
}

const semToken = PAPEIS.filter(papel => !tokens[papel]);
check('emulador de auth entregou token para os quatro papéis', semToken.length === 0, semToken.join(', '));

if (semToken.length === 0) {
  const travadasPorPapel = [];
  const matriz = [];

  for (const alvo of rotas) {
    const chave = `${alvo.endpoint}:${alvo.rota}`;
    const linha = { rota: chave };
    for (const papel of PAPEIS) {
      const status = await chamar(alvo, 'GET', tokens[papel]);
      linha[papel] = status;
      if (status === 500) travadasPorPapel.push(`GET ${chave} como ${papel}`);
    }
    matriz.push(linha);
  }

  check(
    'nenhum GET trava com 500 para nenhum papel',
    travadasPorPapel.length === 0,
    travadasPorPapel.join(' | ')
  );

  console.log('\n── GET por papel ──');
  console.table(matriz);

  /**
   * O RETRATO VIRA CONTRATO.
   *
   * Imprimir a tabela nao protege nada: saida de teste ninguem compara. Estas sao as
   * regras que a matriz revelou e que precisam continuar valendo - quem alargar uma
   * delas sem querer descobre aqui, nao em producao.
   *
   * Qualquer coisa que nao seja 403 significa que o papel passou pelo portao: o 400
   * de parametro faltando tambem conta, porque o gate roda antes.
   */
  const REGRAS = [
    // So Admin: operacoes administrativas sobre a base inteira.
    { rota: 'admin-tools:audit-logs', permitidos: ['Admin'] },
    { rota: 'tickets:rebuild-attention', permitidos: ['Admin'] },
    // Admin + Gestor: o par operacional do dia a dia.
    { rota: 'catalog:settings', permitidos: ['Admin', 'Gestor'] },
    { rota: 'mail:dropped-inbound', permitidos: ['Admin', 'Gestor'] },
    // O PDF do estado da OS nasce na tela de Gestao, que e de Admin+Gestor. O papel
    // e so o primeiro portao: o territorio da OS e conferido depois, e o corte esta
    // em `authz-negativa.mjs`.
    { rota: 'tickets:ticket-pdf', permitidos: ['Admin', 'Gestor'] },
    // Dado financeiro: o solicitante de unidade nao ve contrato nem pagamento.
    { rota: 'procurement:finance', permitidos: ['Admin', 'Gestor'] },
    { rota: 'procurement:', permitidos: ['Admin', 'Gestor', 'Diretor'] },
    // Compromissos de cobranca: quem cobra, nao quem pede.
    { rota: 'tickets:commitments', permitidos: ['Admin', 'Gestor', 'Diretor'] },
    // Anexos: o gate de papel roda antes de qualquer acesso ao Storage.
    { rota: 'attachments:', permitidos: ['Admin', 'Gestor', 'Diretor'] },
    /**
     * ANOMALIA, fixada como esta e RELATADA - nao corrigida por conta propria.
     *
     * `api/mail.js` trava o health em `['Admin', 'Diretor']`. Em todo o resto o par
     * operacional e Admin+Gestor: `dropped-inbound`, logo acima, e a mesma familia
     * de diagnostico de e-mail e aceita Gestor.
     *
     * Ou seja: o diagnostico do e-mail exclui quem opera o e-mail e inclui quem nao
     * opera. Pode ser intencao, mas esta sozinho no sistema. A decisao e de produto;
     * o teste fixa o que existe hoje.
     */
    { rota: 'mail:health', permitidos: ['Admin', 'Diretor'] },
  ];

  const porRota = new Map(matriz.map(linha => [linha.rota, linha]));

  for (const regra of REGRAS) {
    const linha = porRota.get(regra.rota);
    if (!linha) {
      check(`matriz: ${regra.rota} existe`, false, 'rota sumiu do codigo - regra orfa');
      continue;
    }
    const divergencias = PAPEIS.filter(papel => {
      const passou = linha[papel] !== 403;
      return passou !== regra.permitidos.includes(papel);
    });
    check(
      `${regra.rota} - so ${regra.permitidos.join(', ')}`,
      divergencias.length === 0,
      divergencias.map(p => `${p}=${linha[p]}`).join(', ')
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// O rastreio público sem o token cai no caminho autenticado. Sem isto, um dia
// alguém "simplifica" a rota e a lista inteira de OS vira pública.
const semTracking = await chamar({ endpoint: 'tickets', rota: '' }, 'GET', null);
check(
  'GET /api/tickets sem ?tracking= exige credencial',
  semTracking === 401 || semTracking === 403,
  `→ ${semTracking}`
);

for (const ref of docsSemeados) await ref.delete();

/**
 * A MATRIZ E POLUIDORA, e limpa a propria sujeira.
 *
 * Sao ~440 requisicoes de um IP so. Rotas com teto por IP (`confirm-visit`,
 * `revisao-pagina`, o rastreio publico) ficam em 429 depois disso, e o teste
 * seguinte da suite falha inteiro sem ter nada a ver com o proprio assunto -- foi
 * o que aconteceu na primeira vez que a matriz entrou no `test:integration`.
 *
 * Zerar `rateLimits` no fim devolve a base ao estado em que ela foi encontrada.
 */
const limites = await db.collection('rateLimits').get();
for (const doc of limites.docs) await doc.ref.delete();
console.log(`
(limpeza: ${limites.size} contadores de rate-limit zerados)`);

const falhas = results.filter(r => !r.pass).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram.`);
process.exit(falhas === 0 ? 0 : 1);
