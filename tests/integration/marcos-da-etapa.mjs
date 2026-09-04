import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * MARCOS DA ETAPA — a linha do tempo que o sistema descartava.
 *
 * `stageEnteredAt` é um carimbo só, sobrescrito a cada transição: o Serv3 sabia há
 * quanto tempo a OS estava na etapa ATUAL e esquecia todas as anteriores. Medido na
 * produção em 13/08/2026: conseguia reconstruir do histórico a visita técnica em 97%
 * das OS e a conclusão em 36%, e as quatro etapas do meio em 1-3%. A planilha que a
 * coordenação mantém em paralelo tem 226 aprovações de solução, 177 orçamentos e 141
 * ações preliminares datadas — o valor dela é ver as datas LADO A LADO.
 *
 * O unitário cobre a regra (`addStageMarco`). Este cobre o que só o servidor de
 * verdade prova: que o marco atravessa a transação, que a REABERTURA não apaga a data
 * original, e que o cliente não consegue forjar o campo.
 */

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

initializeApp({ projectId: 'os-christus' });
const db = getFirestore();
const API = 'http://127.0.0.1:3001';
const AUTH = 'http://127.0.0.1:9099';
const OS_ID = 'OS-MARCOS-1';

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

async function patch(token, updates) {
  const res = await fetch(`${API}/api/tickets`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ id: OS_ID, updates }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const ler = async () => (await db.collection('tickets').doc(OS_ID).get()).data() || {};
const dia = v => (v?.toDate ? v.toDate() : new Date(v)).toISOString().slice(0, 10);

async function main() {
  const token = await signIn('admin@test.local');

  // OS nasce direto no banco (sem marcos), simulando as 181 que existiam antes deste
  // campo — é justamente nelas que o mapa precisa saber nascer.
  await db.collection('tickets').doc(OS_ID).set({
    id: OS_ID,
    subject: 'Fixture de marcos',
    status: 'Aguardando Parecer Técnico',
    requester: 'Fixture',
    requesterEmail: 'fixture@test.local',
    regionId: 'regiao-sul',
    siteId: 'sul1',
    sede: 'SUL1',
    region: 'Sul',
    priority: 'Alta',
    createdAt: new Date('2026-08-01T09:00:00Z'),
    stageEnteredAt: new Date('2026-08-01T09:00:00Z'),
    history: [],
  });

  check('OS legada começa sem o mapa', !(await ler()).marcos);

  // --- 1. a transição grava o marco
  const r1 = await patch(token, { status: 'Aguardando Orçamento' });
  const d1 = await ler();
  check('transição aceita', r1.status === 200, `HTTP ${r1.status}`);
  check(
    'marco da etapa NOVA gravado',
    Boolean(d1.marcos?.['Aguardando Orçamento']),
    d1.marcos ? dia(d1.marcos['Aguardando Orçamento']) : 'sem mapa'
  );
  check(
    'o marco é o MESMO instante do stageEnteredAt (uma transação, um relógio)',
    String(d1.marcos?.['Aguardando Orçamento']?.toDate?.().toISOString()) ===
      String(d1.stageEnteredAt?.toDate?.().toISOString()),
    dia(d1.stageEnteredAt)
  );

  // --- 2. avançar preserva o marco anterior (o que stageEnteredAt não faz)
  await patch(token, { status: 'Em andamento' });
  const d2 = await ler();
  check(
    'etapa anterior PRESERVADA ao avançar',
    Boolean(d2.marcos?.['Aguardando Orçamento']) && Boolean(d2.marcos?.['Em andamento']),
    Object.keys(d2.marcos || {}).join(', ')
  );
  check(
    'stageEnteredAt, esse sim, andou junto com a etapa atual',
    dia(d2.stageEnteredAt) === dia(d2.marcos['Em andamento']),
    dia(d2.stageEnteredAt)
  );

  // --- 3. REABERTURA não apaga a linha do tempo
  const marcoExecucaoOriginal = d2.marcos['Em andamento'].toDate().toISOString();
  await patch(token, { status: 'Encerrada' });
  const d3 = await ler();
  check('marco de conclusão gravado', Boolean(d3.marcos?.Encerrada));

  await patch(token, { status: 'Em andamento' });
  const d4 = await ler();
  check(
    'reabrir NÃO reescreve o início da execução',
    d4.marcos['Em andamento'].toDate().toISOString() === marcoExecucaoOriginal,
    marcoExecucaoOriginal
  );
  check(
    'reabrir NÃO apaga o marco de conclusão (o histórico é do que aconteceu)',
    Boolean(d4.marcos?.Encerrada)
  );
  check(
    'mas o closedAt é limpo, porque ele responde "está fechada AGORA"',
    d4.closedAt === null || d4.closedAt === undefined,
    String(d4.closedAt)
  );

  // --- 4. o cliente não forja marco
  const forja = await patch(token, {
    status: 'Aguardando Ações Preliminares',
    marcos: { 'Aguardando Orçamento': new Date('2020-01-01T00:00:00Z').toISOString() },
  });
  const d5 = await ler();
  check('PATCH com marcos forjados não é erro (o campo é só ignorado)', forja.status === 200, `HTTP ${forja.status}`);
  check(
    'a data forjada NÃO entrou — marcos está fora da allow-list do PATCH',
    dia(d5.marcos['Aguardando Orçamento']) === dia(d1.marcos['Aguardando Orçamento']),
    dia(d5.marcos['Aguardando Orçamento'])
  );
  check(
    'e a etapa da própria transição foi gravada normalmente',
    Boolean(d5.marcos?.['Aguardando Ações Preliminares'])
  );

  // --- 5. a linha do tempo inteira, que é o ponto
  check(
    'a OS terminou com a linha do tempo completa do que percorreu',
    ['Aguardando Orçamento', 'Em andamento', 'Encerrada', 'Aguardando Ações Preliminares'].every(
      etapa => Boolean(d5.marcos?.[etapa])
    ),
    Object.keys(d5.marcos || {}).join(' · ')
  );

  /*
   * --- 6. OS MARCOS QUE ACONTECERAM SEM DATA (03/09/2026)
   *
   * O unitário cobre a regra. Aqui prova-se o que só o servidor prova: que o campo
   * atravessa a MESMA transação do carimbo, e que o cliente não o forja.
   */
  check(
    'a transição marca os marcos anteriores que ficaram sem carimbo',
    JSON.stringify(d1.marcosSemData) ===
      JSON.stringify(['Aguardando Parecer Técnico', 'Aguardando Aprovação da Solução']),
    JSON.stringify(d1.marcosSemData)
  );
  check(
    'avançar acrescenta o que passou, e NÃO cita marco que tem data',
    JSON.stringify(d2.marcosSemData) ===
      JSON.stringify([
        'Aguardando Parecer Técnico',
        'Aguardando Aprovação da Solução',
        'Aguardando Ações Preliminares',
      ]),
    JSON.stringify(d2.marcosSemData)
  );
  check(
    'o marco que GANHOU carimbo sai da lista — a ressalva some sozinha',
    !d5.marcosSemData?.includes('Aguardando Ações Preliminares'),
    JSON.stringify(d5.marcosSemData)
  );

  const forjaSemData = await patch(token, {
    status: 'Encerrada',
    marcosSemData: ['Aguardando Orçamento', 'inventado'],
  });
  const d6 = await ler();
  check('PATCH com marcosSemData forjado não é erro (o campo é ignorado)', forjaSemData.status === 200);
  check(
    'o cliente NÃO escreve marcosSemData — campo só-servidor, como marcos',
    !d6.marcosSemData?.includes('inventado') && !d6.marcosSemData?.includes('Aguardando Orçamento'),
    JSON.stringify(d6.marcosSemData)
  );

  await db.collection('tickets').doc(OS_ID).delete();

  const falhas = results.filter(item => !item.pass).length;
  console.log(`\n=== ${results.length - falhas}/${results.length} OK ===`);
  process.exit(falhas > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('FALHOU  erro inesperado —', error);
  process.exit(1);
});
