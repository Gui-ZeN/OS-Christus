import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';
import {
  LIFECYCLE_TICKET_IDS,
  readTicketRecord,
  readTicketRecords,
  readTicketState,
  resetLifecycleFixtures,
} from './e2e/lifecycle-state';

const managerEmail = process.env.E2E_MANAGER_EMAIL || 'gestor.e2e@test.local';
const password = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

function normalizeCurrencyLabel(value: unknown) {
  return String(value || '').replace(/\s/g, ' ');
}

/**
 * O que sobrou aqui é o fluxo FINANCEIRO.
 *
 * Os quatro testes da aprovação da diretoria saíram junto com a funcionalidade: não
 * havia nenhum Diretor cadastrado em produção, `directorEmails` estava preenchido em
 * 1 das 270 OS (com endereço de teste), e a aprovação real sempre aconteceu por
 * e-mail — agora capturada de lá. Manter teste verde para tela que não existe seria
 * pior que não ter teste: passaria a impressão de cobertura sobre o vazio.
 */
test.describe('ciclo crítico transacional', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    await resetLifecycleFixtures();
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

});
