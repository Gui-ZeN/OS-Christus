const LIFECYCLE_TICKET_IDS = {
  solution: 'OS-E2E-SOLUTION',
  budget: 'OS-E2E-BUDGET',
  payment: 'OS-E2E-PAYMENT',
  contract: 'OS-E2E-CONTRACT',
};

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

  const solutionRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.solution);
  const budgetRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.budget);
  const paymentRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.payment);
  const contractRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.contract);

  await Promise.all([
    solutionRef.set(createTicket({
      id: LIFECYCLE_TICKET_IDS.solution,
      status: 'Aguardando Aprovação da Solução',
      subject: 'Fixture E2E - aprovação da solução técnica',
      directorEmail,
      now,
      history: [{
        id: 'history-e2e-technical-opinion',
        type: 'tech',
        sender: 'Gestor E2E',
        time: now,
        text: 'Parecer técnico E2E: executar a correção proposta.',
        visibility: 'internal',
      }],
    })),
    budgetRef.set(createTicket({
      id: LIFECYCLE_TICKET_IDS.budget,
      status: 'Aguardando Aprovação do Orçamento',
      subject: 'Fixture E2E - escolha de orçamento',
      directorEmail,
      now,
    })),
    contractRef.set(createTicket({
      id: LIFECYCLE_TICKET_IDS.contract,
      status: 'Aguardando aprovação do contrato',
      subject: 'Fixture E2E - aprovação/reprovação de contrato',
      directorEmail,
      now,
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

  const quoteBase = {
    ticketId: LIFECYCLE_TICKET_IDS.budget,
    category: 'initial',
    initialRoundIndex: 1,
    additiveIndex: null,
    status: 'pending',
    recommended: false,
    materialValue: 'R$ 600,00',
    laborValue: 'R$ 400,00',
    items: [],
    submittedBy: {
      id: 'user-gestor-e2e',
      name: 'Gestor E2E',
      email: 'gestor.e2e@test.local',
      role: 'Gestor',
    },
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    budgetRef.collection('quotes').doc('quote-e2e-a').set({
      ...quoteBase,
      id: 'quote-e2e-a',
      vendor: 'Fornecedor E2E A',
      value: 'R$ 1.000,00',
      totalValue: 'R$ 1.000,00',
    }),
    budgetRef.collection('quotes').doc('quote-e2e-b').set({
      ...quoteBase,
      id: 'quote-e2e-b',
      vendor: 'Fornecedor E2E B',
      value: 'R$ 1.200,00',
      totalValue: 'R$ 1.200,00',
    }),
    contractRef.collection('contracts').doc('contract-1').set({
      id: 'contract-1',
      ticketId: LIFECYCLE_TICKET_IDS.contract,
      vendor: 'Fornecedor E2E Contrato',
      value: 'R$ 2.500,00',
      initialPlannedValue: 'R$ 2.500,00',
      realizedValue: 'R$ 2.500,00',
      status: 'pending_approval',
      // signedFileName habilita o botão "Aprovar Contrato" (a UI exige anexo).
      signedFileName: 'contrato-e2e.pdf',
      signedFilePath: `attachments/tickets/contracts/${LIFECYCLE_TICKET_IDS.contract}/contrato-e2e.pdf`,
      signedFileContentType: 'application/pdf',
      items: [],
      createdAt: now,
      updatedAt: now,
    }),
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
