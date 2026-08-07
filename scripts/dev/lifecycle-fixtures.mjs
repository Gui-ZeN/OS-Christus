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

  const paymentRef = db.collection('tickets').doc(LIFECYCLE_TICKET_IDS.payment);

  await Promise.all([
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
