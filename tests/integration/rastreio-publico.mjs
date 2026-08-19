import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * O QUE A PÁGINA PÚBLICA DE ACOMPANHAMENTO **NÃO** PODE MOSTRAR.
 *
 * `GET /api/tickets?tracking=<token>` é a segunda porta sem login do sistema. Quem
 * tem o link vê a própria OS — e o link viaja por e-mail, é encaminhado, fica no
 * histórico de conversa de quem quer que seja.
 *
 * O payload é montado por allow-list, que é o desenho certo: campo novo não vaza
 * sozinho. Mas DENTRO dela há duas deny-lists — `closureChecklist` e
 * `executionProgress` são espalhados e depois têm campos apagados por nome. Nessas
 * duas, um campo novo VAZA por padrão, e ninguém percebe porque a tela não muda.
 *
 * ⚠️ A TÉCNICA AQUI É SENTINELA. Cada campo interno da OS recebe um texto único e
 * inconfundível; a asserção é que NENHUM deles aparece na resposta inteira,
 * serializada. Isso protege campo que ainda não existe: quem acrescentar um dado
 * sensível e esquecer de escondê-lo cai aqui, não numa captura de tela.
 *
 * Foi assim que o contrato das OS achou dois vazamentos de data. O mesmo método,
 * numa fronteira onde o que vaza não é formato — é informação.
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

const ID = 'OS-RASTREIO-TESTE';
const TOKEN = 'trk_teste_de_contrato_publico';
const dias = d => Timestamp.fromDate(new Date(Date.now() + d * 24 * 60 * 60 * 1000));

/**
 * Cada sentinela é um dado que NÃO pode chegar a quem tem só o link.
 * O nome diz o que estaria vazando se ele aparecer.
 */
const SENTINELAS = {
  'e-mail do solicitante': 'SENTINELA-EMAIL-SOLICITANTE@interno.local',
  'e-mail de diretor': 'SENTINELA-EMAIL-DIRETOR@interno.local',
  'nome de anexo': 'SENTINELA-ANEXO.pdf',
  'caminho de anexo no Storage': 'attachments/SENTINELA-CAMINHO',
  'planilha de medição': 'https://SENTINELA-PLANILHA-MEDICAO',
  'documento de encerramento': 'SENTINELA-DOCUMENTO-ENCERRAMENTO',
  'nota de bloqueio': 'SENTINELA-NOTA-DE-BLOQUEIO',
  'nota interna do histórico': 'SENTINELA-NOTA-INTERNA-DO-HISTORICO',
  'próxima ação da gestora': 'SENTINELA-PROXIMA-ACAO',
  'motivo da suspensão': 'SENTINELA-MOTIVO-SUSPENSAO',
  'fornecedor do contrato': 'SENTINELA-FORNECEDOR',
  'valor do contrato': 'SENTINELA-VALOR-CONTRATO',
  'valor do pagamento': 'SENTINELA-VALOR-PAGAMENTO',
};

const S = SENTINELAS;

async function limpar() {
  const ref = db.collection('tickets').doc(ID);
  for (const col of ['contracts', 'payments', 'measurements']) {
    const snap = await ref.collection(col).get();
    await Promise.all(snap.docs.map(d => d.ref.delete()));
  }
  await ref.delete().catch(() => {});
}

async function semear() {
  await limpar();
  const ref = db.collection('tickets').doc(ID);
  await ref.set({
    subject: 'Goteira no auditório',
    status: 'Em andamento',
    sede: 'DL',
    region: 'Universidade',
    sector: 'Manutenção',
    location: 'Bloco B',
    priority: 'Alta',
    requester: 'Solicitante Público',
    time: dias(-10),
    trackingToken: TOKEN,

    // ── tudo daqui para baixo é interno
    requesterEmail: S['e-mail do solicitante'],
    directorEmails: [S['e-mail de diretor']],
    attachments: [{ id: 'a1', name: S['nome de anexo'], path: S['caminho de anexo no Storage'] }],
    nextAction: { what: S['próxima ação da gestora'], dueAt: dias(1) },
    attention: { state: 'suspensa', reason: 'sem-verba', note: S['motivo da suspensão'], reviewAt: dias(9) },
    executionProgress: { currentPercent: 40, measurementSheetUrl: S['planilha de medição'] },
    closureChecklist: {
      infrastructureApprovalPrimary: true,
      infrastructureApprovalSecondary: false,
      documents: [{ id: 'd1', name: S['documento de encerramento'], path: 'x/y' }],
    },
    preliminaryActions: { plannedStartAt: dias(2), blockerNotes: S['nota de bloqueio'] },
    history: [
      {
        id: 'h-publica',
        type: 'customer',
        sender: 'Solicitante Público',
        time: dias(-10),
        text: 'Abri o chamado da goteira.',
        visibility: 'public',
      },
      {
        id: 'h-interna',
        type: 'system',
        sender: 'Sistema',
        time: dias(-2),
        text: S['nota interna do histórico'],
        visibility: 'internal',
      },
    ],
  });

  await ref.collection('contracts').doc('contract-1').set({
    ticketId: ID,
    vendor: S['fornecedor do contrato'],
    totalValue: S['valor do contrato'],
    status: 'signed',
  });
  await ref.collection('payments').doc('p1').set({
    ticketId: ID,
    vendor: S['fornecedor do contrato'],
    value: S['valor do pagamento'],
    status: 'paid',
    paidAt: dias(-1),
  });
}

async function main() {
  await semear();

  const res = await fetch(`${API}/api/tickets?tracking=${encodeURIComponent(TOKEN)}`);
  const json = await res.json().catch(() => ({}));
  check('a rota pública responde 200 com o token', res.status === 200, `HTTP ${res.status}`);
  check('devolve a OS', Boolean(json.ticket?.id), JSON.stringify(Object.keys(json)));
  if (!json.ticket) {
    console.log('\n=== abortado: sem a OS não há o que verificar ===');
    return 1;
  }

  // ── O QUE PRECISA APARECER. Uma página que esconde tudo não serve para nada.
  check('o assunto e a etapa chegam', json.ticket.subject === 'Goteira no auditório' && json.ticket.status === 'Em andamento');
  check('a sede chega', json.ticket.sede === 'DL');
  const publica = (json.ticket.history || []).some(h => String(h.text || '').includes('Abri o chamado'));
  check('a mensagem PÚBLICA do histórico chega', publica, `${(json.ticket.history || []).length} entradas`);

  // ── O QUE NÃO PODE APARECER, uma sentinela por vez.
  const inteiro = JSON.stringify(json);
  const vazados = [];
  for (const [nome, valor] of Object.entries(SENTINELAS)) {
    if (inteiro.includes(valor)) vazados.push(nome);
  }
  check(
    'NENHUM dado interno aparece na resposta (13 sentinelas)',
    vazados.length === 0,
    vazados.length ? `VAZOU: ${vazados.join(', ')}` : 'nada vazou'
  );

  // ── A entrada interna do histórico não pode nem existir na lista.
  const temInterna = (json.ticket.history || []).some(h => String(h.visibility || '') === 'internal');
  check('nenhuma entrada interna do histórico atravessa', !temInterna);

  /**
   * ⚠️ AS DUAS DENY-LISTS, transformadas em allow-list AQUI.
   *
   * `closureChecklist` e `executionProgress` são espalhados e depois têm campos
   * apagados por nome — então um campo novo vaza por padrão. Este teste fixa o
   * conjunto de chaves permitido: quem acrescentar um campo cai aqui e decide de
   * propósito se ele é público, em vez de descobrir depois.
   */
  const chaves = obj => Object.keys(obj || {}).sort();
  // Conferido em `TrackingView`: as quatro datas são exibidas ao solicitante — ele
  // acompanha quando o serviço começou, terminou e quando ele mesmo aprovou. As duas
  // aprovações de infraestrutura seguem removidas por nome no sanitizador.
  const permitidoNoChecklist = [
    'closedAt',
    'requesterApprovedAt',
    'serviceCompletedAt',
    'serviceStartedAt',
  ];
  const inesperadasNoChecklist = chaves(json.ticket.closureChecklist).filter(
    k => !permitidoNoChecklist.includes(k)
  );
  check(
    'closureChecklist não ganhou campo novo sem alguém decidir',
    inesperadasNoChecklist.length === 0,
    inesperadasNoChecklist.length ? `novas: ${inesperadasNoChecklist.join(', ')}` : chaves(json.ticket.closureChecklist).join(', ') || 'vazio'
  );

  // Idem: a barra de progresso e as duas datas que a acompanham. O que NÃO pode
  // sair daqui é a planilha de medição, que tem link assinado.
  const permitidoNoProgresso = ['currentPercent', 'lastUpdatedAt', 'startedAt'];
  const inesperadasNoProgresso = chaves(json.ticket.executionProgress).filter(
    k => !permitidoNoProgresso.includes(k)
  );
  check(
    'executionProgress não ganhou campo novo sem alguém decidir',
    inesperadasNoProgresso.length === 0,
    inesperadasNoProgresso.length ? `novas: ${inesperadasNoProgresso.join(', ')}` : chaves(json.ticket.executionProgress).join(', ') || 'vazio'
  );

  // ── O dinheiro sai em branco de propósito, mas o ANDAMENTO chega.
  check(
    'o valor do contrato e do pagamento saem vazios',
    json.procurement?.contract?.value === '' && (json.procurement?.payments || []).every(p => p.value === ''),
    JSON.stringify(json.procurement?.contract)
  );
  check(
    'mas o status do pagamento chega — é o que o solicitante acompanha',
    (json.procurement?.payments || []).some(p => p.status === 'paid'),
    JSON.stringify((json.procurement?.payments || []).map(p => p.status))
  );

  // ── Token errado não abre nada.
  const semToken = await fetch(`${API}/api/tickets?tracking=token-que-nao-existe`);
  check('token inexistente responde 404', semToken.status === 404, `HTTP ${semToken.status}`);

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
