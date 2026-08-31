/**
 * Fixtures do E2E de ciclo crítico.
 *
 * Sobrou o PAGAMENTO. As três OS de aprovação (solução, orçamento, contrato) saíram
 * junto com a etapa da diretoria: semear OS num estado que o sistema recusa criar
 * seria testar contra um mundo que não existe — e um dia alguém leria a fixture como
 * documentação do fluxo.
 */
const LIFECYCLE_TICKET_IDS = {
  payment: 'OS-E2E-PAYMENT',
  // As tres OS da troca de etapa pela Inbox. Nasceram de tres defeitos que chegaram
  // a producao juntos, em 12/08, e que NENHUM teste pegou — o de ciclo critico passa
  // pelo Financeiro, e o seletor da Inbox nao tinha cobertura nenhuma.
  parecer: 'OS-E2E-PARECER',
  encerrada: 'OS-E2E-ENCERRADA',
  desistir: 'OS-E2E-DESISTIR',
};

/** A mensagem que TEM que sair no PDF do estado da OS. */
export const NOTA_PUBLICA_DA_CONVERSA = 'O teto da recepcao voltou a pingar depois da chuva.';

/** A que NUNCA pode sair: o papel circula, e nota interna nao acompanha. */
export const NOTA_INTERNA_DA_CONVERSA = 'NOTA INTERNA E2E: combinar o valor por fora com o fornecedor.';

const TICKET_SUBCOLLECTIONS = [
  'approvalCommands',
  'approvalSnapshots',
  'contracts',
  'financeCommands',
  'financeSnapshots',
  'history',
  'measurements',
  'payments',
  'quotes',
];

async function deleteQuery(db, query) {
  const snapshot = await query.get();
  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}

async function clearTicketFixture(db, ticketId) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  await Promise.all(
    TICKET_SUBCOLLECTIONS.map(name => deleteQuery(db, ticketRef.collection(name)))
  );
  await Promise.all([
    deleteQuery(db, db.collection('emailOutbox').where('ticketId', '==', ticketId)),
    deleteQuery(db, db.collection('auditLogs').where('entityId', '==', ticketId)),
  ]);
}

function createTicket({
  id,
  status,
  subject,
  directorEmail,
  now,
  history = [],
  extra = {},
}) {
  return {
    id,
    trackingToken: `trk_${id.toLowerCase().replace(/-/g, '')}`,
    subject,
    requester: 'Solicitante E2E',
    requesterEmail: 'solicitante.e2e@test.local',
    requesterCcEmails: [],
    status,
    type: 'Manutenção Predial Estrutural',
    regionId: 'universidade',
    region: 'Universidade',
    siteId: 'pql3',
    sede: 'PQL3',
    sector: 'Recepção',
    location: '',
    priority: 'Moderado',
    macroServiceId: null,
    macroServiceName: null,
    serviceCatalogId: null,
    serviceCatalogName: null,
    directorIds: [],
    directorEmails: [directorEmail],
    time: now,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        id: `history-${id}-request`,
        type: 'customer',
        sender: 'Solicitante E2E',
        time: now,
        text: subject,
        visibility: 'public',
      },
      ...history,
    ],
    ...extra,
  };
}

export async function seedLifecycleFixtures(
  db,
  { directorEmail = 'diretor.e2e@test.local' } = {}
) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('As fixtures de ciclo de vida só podem ser usadas no emulador do Firestore.');
  }

  const now = new Date();
  const serviceStartedAt = new Date('2026-06-01T12:00:00.000Z');
  const serviceCompletedAt = new Date('2026-06-15T12:00:00.000Z');

  await Promise.all(
    Object.values(LIFECYCLE_TICKET_IDS).map(ticketId => clearTicketFixture(db, ticketId))
  );

  const paymentRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.payment);
  const parecerRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.parecer);
  const encerradaRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.encerrada);
  const desistirRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.desistir);

  // Classificada de proposito: a trava de classificacao e outra regra, com teste
  // proprio. Aqui o alvo e a TROCA DE ETAPA.
  const classificada = {
    macroServiceId: 'macro-e2e',
    macroServiceName: 'Estrutura Civil',
    serviceCatalogId: 'serv-e2e',
    serviceCatalogName: 'Reforma',
  };

  await Promise.all([
    parecerRef.set(createTicket({
      id: LIFECYCLE_TICKET_IDS.parecer,
      status: 'Aguardando Parecer Técnico',
      subject: 'Fixture E2E - parecer tecnico com diretor',
      directorEmail,
      now,
      // A CONVERSA QUE PROVA O CORTE DO PDF.
      //
      // O retrato da OS em PDF (`?route=ticket-pdf`) e um arquivo: ele circula por
      // e-mail e e impresso. Estas duas entradas existem para o E2E poder afirmar o
      // corte abrindo o arquivo — uma tem que aparecer no papel, a outra nunca.
      history: [
        {
          id: `history-${LIFECYCLE_TICKET_IDS.parecer}-publica`,
          type: 'customer',
          sender: 'Solicitante E2E',
          time: now,
          text: NOTA_PUBLICA_DA_CONVERSA,
          visibility: 'public',
        },
        {
          id: `history-${LIFECYCLE_TICKET_IDS.parecer}-interna`,
          type: 'internal',
          sender: 'Gestor E2E (Gestor)',
          time: now,
          text: NOTA_INTERNA_DA_CONVERSA,
          visibility: 'internal',
        },
      ],
      // COM diretor: era exatamente este caso que apontava para a etapa aposentada
      // da diretoria e falhava com 409, sem mover nada.
      extra: { ...classificada, directorIds: ['dir-e2e'], directorEmails: [directorEmail] },
    })),
    encerradaRef.set(createTicket({
      id: LIFECYCLE_TICKET_IDS.encerrada,
      status: 'Encerrada',
      subject: 'Fixture E2E - encerrada por engano',
      directorEmail,
      now,
      extra: classificada,
    })),
    desistirRef.set(createTicket({
      id: LIFECYCLE_TICKET_IDS.desistir,
      status: 'Aguardando Parecer Técnico',
      subject: 'Fixture E2E - desistir da troca de etapa',
      directorEmail,
      now,
      extra: classificada,
    })),
    paymentRef.set(createTicket({
      id: LIFECYCLE_TICKET_IDS.payment,
      status: 'Aguardando pagamento',
      subject: 'Fixture E2E - pagamento final e encerramento',
      directorEmail,
      now,
      extra: {
        executionProgress: {
          paymentFlowParts: 1,
          currentPercent: 100,
          releasedPercent: 100,
          startedAt: serviceStartedAt,
          lastUpdatedAt: now,
        },
        closureChecklist: {
          infrastructureApprovalPrimary: true,
          infrastructureApprovalSecondary: true,
          serviceStartedAt,
          serviceCompletedAt,
          closureNotes: 'Checklist preparado para o encerramento E2E.',
          documents: [],
        },
      },
    })),
  ]);

  await Promise.all([
    paymentRef.collection('contracts').doc('contract-1').set({
      id: 'contract-1',
      ticketId: LIFECYCLE_TICKET_IDS.payment,
      vendor: 'Fornecedor E2E Final',
      value: 'R$ 1.000,00',
      initialPlannedValue: 'R$ 1.000,00',
      realizedValue: 'R$ 1.000,00',
      status: 'approved',
      items: [],
      createdAt: now,
      updatedAt: now,
    }),
    paymentRef.collection('payments').doc('payment-e2e-final').set({
      id: 'payment-e2e-final',
      ticketId: LIFECYCLE_TICKET_IDS.payment,
      vendor: 'Fornecedor E2E Final',
      value: 'R$ 1.000,00',
      grossValue: 'R$ 1.000,00',
      taxValue: '',
      netValue: 'R$ 1.000,00',
      expectedBaselineValue: 'R$ 1.000,00',
      budgetSource: 'initial',
      status: 'approved',
      label: 'Pagamento final E2E',
      installmentNumber: 1,
      totalInstallments: 1,
      releasedPercent: 100,
      milestonePercent: 100,
      attachments: [],
      submittedBy: {
        id: 'user-gestor-e2e',
        name: 'Gestor E2E',
        email: 'gestor.e2e@test.local',
        role: 'Gestor',
      },
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  return LIFECYCLE_TICKET_IDS;
}

export { LIFECYCLE_TICKET_IDS };
