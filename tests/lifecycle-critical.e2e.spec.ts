import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';
import {
  LIFECYCLE_TICKET_IDS,
  readTicketRecord,
  readTicketRecords,
  readTicketState,
  resetLifecycleFixtures,
} from './e2e/lifecycle-state';

const directorEmail = process.env.E2E_DIRECTOR_EMAIL || 'diretor.e2e@test.local';
const managerEmail = process.env.E2E_MANAGER_EMAIL || 'gestor.e2e@test.local';
const password = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

function normalizeCurrencyLabel(value: unknown) {
  return String(value || '').replace(/\s/g, ' ');
}

test.describe('ciclo crítico transacional', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    await resetLifecycleFixtures();
  });

  test('Diretor aprova solução e orçamento sem poder alterar valores', async ({ page }) => {
    await loginWithPassword(page, directorEmail, password);
    await page.getByTitle('Painel da Diretoria').click();
    await expect(page.getByRole('heading', { name: 'Painel da Diretoria' })).toBeVisible();

    const solutionCard = page.locator(
      `#approval-solution-${LIFECYCLE_TICKET_IDS.solution}`
    );
    await expect(solutionCard).toContainText('Parecer técnico E2E');
    await solutionCard
      .getByRole('button', { name: 'Aprovar (Ir para Cotação)' })
      .click();
    await expect(page.getByText('Solução técnica aprovada.', { exact: true })).toBeVisible();
    await expect(solutionCard).toHaveCount(0);

    const solutionTicket = await readTicketState(LIFECYCLE_TICKET_IDS.solution);
    expect(solutionTicket?.status).toBe('Aguardando Orçamento');
    const solutionSnapshots = await readTicketRecords(
      LIFECYCLE_TICKET_IDS.solution,
      'approvalSnapshots'
    );
    expect(solutionSnapshots).toHaveLength(1);
    expect(solutionSnapshots[0]).toMatchObject({
      action: 'approveSolution',
      previousStatus: 'Aguardando Aprovação da Solução',
      nextStatus: 'Aguardando Orçamento',
      actor: {
        email: directorEmail,
        role: 'Diretor',
      },
    });

    await page.getByRole('button', { name: /^Orçamentos \(/ }).click();
    const budgetCard = page.locator(
      `#approval-budget-${LIFECYCLE_TICKET_IDS.budget}`
    );
    await expect(budgetCard).toContainText('Fornecedor E2E A');
    await expect(budgetCard).toContainText('R$ 1.000,00');
    await expect(budgetCard.getByRole('textbox')).toHaveCount(0);
    await budgetCard
      .getByRole('button', { name: 'Aprovar esta opção' })
      .first()
      .click();
    await expect(
      page.getByText('Orçamento de Fornecedor E2E A aprovado.', { exact: true })
    ).toBeVisible();
    await expect(budgetCard).toHaveCount(0);

    const budgetTicket = await readTicketState(LIFECYCLE_TICKET_IDS.budget);
    expect(budgetTicket?.status).toBe('Aguardando Anexo de Contrato');
    await expect.poll(async () => (
      await readTicketRecord(
        LIFECYCLE_TICKET_IDS.budget,
        'quotes',
        'quote-e2e-a'
      )
    )?.status).toBe('approved');
    expect((
      await readTicketRecord(
        LIFECYCLE_TICKET_IDS.budget,
        'quotes',
        'quote-e2e-b'
      )
    )?.status).toBe('rejected');

    const contract = await readTicketRecord(
      LIFECYCLE_TICKET_IDS.budget,
      'contracts',
      'contract-1'
    );
    expect(contract).toMatchObject({
      vendor: 'Fornecedor E2E A',
      status: 'pending_upload',
    });
    expect(normalizeCurrencyLabel(contract?.value)).toBe('R$ 1.000,00');
    expect(normalizeCurrencyLabel(contract?.initialPlannedValue)).toBe('R$ 1.000,00');

    const budgetSnapshots = await readTicketRecords(
      LIFECYCLE_TICKET_IDS.budget,
      'approvalSnapshots'
    );
    expect(budgetSnapshots).toHaveLength(1);
    expect(budgetSnapshots[0]).toMatchObject({
      action: 'approveBudget',
      previousStatus: 'Aguardando Aprovação do Orçamento',
      nextStatus: 'Aguardando Anexo de Contrato',
      actor: {
        email: directorEmail,
        role: 'Diretor',
      },
      financial: {
        submittedBy: {
          email: managerEmail,
          role: 'Gestor',
        },
        quote: {
          id: 'quote-e2e-a',
          vendor: 'Fornecedor E2E A',
          totalValue: 'R$ 1.000,00',
        },
      },
    });
    const budgetSnapshot = budgetSnapshots[0] as Record<string, unknown>;
    const frozenFinancial = budgetSnapshot.financial as {
      frozenInitialValue?: string;
      frozenRealizedValue?: string;
    };
    expect(normalizeCurrencyLabel(frozenFinancial.frozenInitialValue)).toBe('R$ 1.000,00');
    expect(normalizeCurrencyLabel(frozenFinancial.frozenRealizedValue)).toBe('R$ 1.000,00');
  });

  test('Gestor confirma o pagamento final e encerra a OS', async ({ page }) => {
    await page.route(url =>
      url.pathname === '/api/mail' && url.searchParams.get('route') === 'send',
    async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await loginWithPassword(page, managerEmail, password);
    await page.getByTitle('Financeiro').click();
    await expect(page.getByRole('heading', { name: 'Painel Financeiro' })).toBeVisible();

    const financeCard = page.locator(
      `#finance-ticket-${LIFECYCLE_TICKET_IDS.payment}`
    );
    await expect(financeCard).toContainText('Pagamento final E2E');
    await financeCard.getByRole('button', { name: 'Disparar Email' }).click();

    const paymentDialog = page.getByRole('dialog', {
      name: 'Disparar Email de Pagamento',
    });
    await expect(paymentDialog).toBeVisible();
    await paymentDialog
      .getByPlaceholder('email@exemplo.com')
      .fill('financeiro.e2e@test.local');
    await paymentDialog.getByRole('button', { name: 'Adicionar' }).click();
    const settleRequestPromise = page.waitForRequest(request => {
      if (request.method() !== 'POST' || !request.url().endsWith('/api/finance')) return false;
      return request.postDataJSON()?.action === 'settlePayment';
    });
    await paymentDialog
      .getByRole('button', { name: 'Enviar Email e Confirmar' })
      .click();
    const settleRequest = await settleRequestPromise;

    await expect(
      page.getByText(
        `Pagamento final confirmado. OS ${LIFECYCLE_TICKET_IDS.payment} encerrada com sucesso.`,
        { exact: true }
      )
    ).toBeVisible();

    const paymentTicket = await readTicketState(LIFECYCLE_TICKET_IDS.payment);
    expect(paymentTicket?.status).toBe('Encerrada');
    expect(paymentTicket?.closureChecklist).toMatchObject({
      infrastructureApprovalPrimary: true,
      infrastructureApprovalSecondary: true,
    });
    expect(paymentTicket?.guarantee).toMatchObject({
      months: 12,
      status: 'active',
    });

    const payment = await readTicketRecord(
      LIFECYCLE_TICKET_IDS.payment,
      'payments',
      'payment-e2e-final'
    );
    expect(payment).toMatchObject({
      status: 'paid',
      settledBy: {
        email: managerEmail,
        role: 'Gestor',
      },
    });
    expect(normalizeCurrencyLabel(payment?.grossValue)).toBe('R$ 1.000,00');
    expect(normalizeCurrencyLabel(payment?.taxValue)).toBe('R$ 0,00');
    expect(normalizeCurrencyLabel(payment?.netValue)).toBe('R$ 1.000,00');

    const financeSnapshots = await readTicketRecords(
      LIFECYCLE_TICKET_IDS.payment,
      'financeSnapshots'
    );
    expect(financeSnapshots).toHaveLength(1);
    expect(financeSnapshots[0]).toMatchObject({
      action: 'settlePayment',
      previousStatus: 'Aguardando pagamento',
      nextStatus: 'Encerrada',
      actor: {
        email: managerEmail,
        role: 'Gestor',
      },
      recipients: ['financeiro.e2e@test.local'],
    });

    const replayResponse = await page.request.post('/api/finance', {
      headers: {
        authorization: settleRequest.headers().authorization,
        'content-type': 'application/json',
      },
      data: settleRequest.postDataJSON(),
    });
    expect(replayResponse.ok()).toBe(true);
    const replayResult = await replayResponse.json();
    expect(replayResult).toMatchObject({
      ok: true,
      action: 'settlePayment',
      replayed: true,
      closed: true,
    });
    expect(
      await readTicketRecords(LIFECYCLE_TICKET_IDS.payment, 'financeSnapshots')
    ).toHaveLength(1);
  });

  test('Diretor aprova o contrato e a OS segue para ações preliminares', async ({ page }) => {
    await loginWithPassword(page, directorEmail, password);
    await page.getByTitle('Painel da Diretoria').click();
    await expect(page.getByRole('heading', { name: 'Painel da Diretoria' })).toBeVisible();

    await page.getByRole('button', { name: /^Contratos \(/ }).click();
    const contractCard = page.locator(
      `#approval-contract-${LIFECYCLE_TICKET_IDS.contract}`
    );
    await expect(contractCard).toContainText('Fornecedor E2E Contrato');
    // O Diretor decide sobre o contrato — não edita valores (mesma garantia do orçamento).
    await expect(contractCard.getByRole('textbox')).toHaveCount(0);

    await contractCard.getByRole('button', { name: 'Aprovar Contrato' }).click();
    await expect(contractCard).toHaveCount(0);

    const ticket = await readTicketState(LIFECYCLE_TICKET_IDS.contract);
    expect(ticket?.status).toBe('Aguardando Ações Preliminares');
    await expect.poll(async () => (
      await readTicketRecord(LIFECYCLE_TICKET_IDS.contract, 'contracts', 'contract-1')
    )?.status).toBe('approved');
  });

  test('Diretor reprova o contrato: volta para reenvio SEM cancelar a OS', async ({ page }) => {
    await loginWithPassword(page, directorEmail, password);
    await page.getByTitle('Painel da Diretoria').click();
    await expect(page.getByRole('heading', { name: 'Painel da Diretoria' })).toBeVisible();

    await page.getByRole('button', { name: /^Contratos \(/ }).click();
    const contractCard = page.locator(
      `#approval-contract-${LIFECYCLE_TICKET_IDS.contract}`
    );
    await expect(contractCard).toContainText('Fornecedor E2E Contrato');
    await contractCard.getByRole('button', { name: 'Reprovar Contrato' }).click();

    const rejectDialog = page.getByRole('dialog', { name: 'Reprovar Contrato' });
    await expect(rejectDialog).toBeVisible();
    await rejectDialog.getByPlaceholder('Descreva o motivo...').fill('Cláusula de garantia divergente do orçamento aprovado.');
    await rejectDialog.getByRole('button', { name: 'Confirmar Reprovação' }).click();
    await expect(contractCard).toHaveCount(0);

    // A REGRESSÃO que este teste existe para pegar: a reprovação de contrato já caiu
    // no ramo de cancelamento e matou a OS inteira. Deve voltar para reenvio.
    await expect.poll(async () => (
      await readTicketState(LIFECYCLE_TICKET_IDS.contract)
    )?.status).toBe('Aguardando Anexo de Contrato');
    const ticket = await readTicketState(LIFECYCLE_TICKET_IDS.contract);
    expect(ticket?.status).not.toBe('Cancelada');
    // O contrato volta a aceitar novo anexo (não fica travado como aprovado).
    const contract = await readTicketRecord(LIFECYCLE_TICKET_IDS.contract, 'contracts', 'contract-1');
    expect(contract?.status).toBe('pending_upload');
  });

  test('Dois diretores decidindo a MESMA rodada ao mesmo tempo: só uma decisão vale', async ({ page }) => {
    // Concorrência real (não replay): duas requisições simultâneas, com chaves de
    // idempotência DIFERENTES, escolhendo fornecedores DIFERENTES da mesma rodada.
    // Se as duas passassem, o contrato ficaria com dois vencedores e o valor
    // realizado seria de uma cotação que ninguém aprovou.
    const ticketsRequestPromise = page.waitForRequest(
      request => request.url().includes('/api/tickets') && request.method() === 'GET'
    );
    await loginWithPassword(page, directorEmail, password);
    const authorization = (await ticketsRequestPromise).headers().authorization;
    expect(authorization).toBeTruthy();

    const decide = (idempotencyKey: string, selectedQuoteId: string) =>
      page.request.post('/api/approvals', {
        headers: { authorization, 'content-type': 'application/json' },
        data: {
          action: 'approveBudget',
          ticketId: LIFECYCLE_TICKET_IDS.budget,
          idempotencyKey,
          selectedQuoteId,
        },
      });

    const [first, second] = await Promise.all([
      decide('concurrency-director-a', 'quote-e2e-a'),
      decide('concurrency-director-b', 'quote-e2e-b'),
    ]);

    const statuses = [first.status(), second.status()].sort();
    const accepted = [first, second].filter(response => response.ok());
    expect(accepted).toHaveLength(1);
    // A perdedora é rejeitada por conflito de estado, não por erro genérico.
    expect(statuses.filter(status => status === 200)).toHaveLength(1);
    expect(statuses.some(status => status === 409), `statuses: ${statuses.join(', ')}`).toBe(true);

    // Estado final consistente: uma única decisão registrada.
    expect(
      await readTicketRecords(LIFECYCLE_TICKET_IDS.budget, 'approvalSnapshots')
    ).toHaveLength(1);

    const winner = await accepted[0].json();
    const quotes = await readTicketRecords(LIFECYCLE_TICKET_IDS.budget, 'quotes');
    const approved = quotes.filter(quote => quote.status === 'approved');
    expect(approved).toHaveLength(1);
    expect(approved[0].id).toBe(winner.selectedQuoteId);

    // O contrato reflete exatamente a cotação vencedora — sem soma das duas.
    const contract = await readTicketRecord(
      LIFECYCLE_TICKET_IDS.budget,
      'contracts',
      'contract-1'
    );
    expect(normalizeCurrencyLabel(contract?.realizedValue)).toBe(
      normalizeCurrencyLabel(approved[0].totalValue || approved[0].value)
    );

    const ticket = await readTicketState(LIFECYCLE_TICKET_IDS.budget);
    expect(ticket?.status).toBe('Aguardando Anexo de Contrato');
  });
});
