import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';
import { LIFECYCLE_TICKET_IDS, readTicketState, resetLifecycleFixtures } from './e2e/lifecycle-state';

/**
 * Regressão do P2 "sucesso sem aguardar o backend" (4ª auditoria).
 *
 * A Inbox tinha 12 chamadas de `updateTicket` sem `await`: o modal fechava e o
 * toast de sucesso aparecia ANTES (e independentemente) da resposta do servidor.
 * Com o PATCH falhando, o usuário via "OS cancelada" e a OS continuava ativa.
 *
 * Este teste força o PATCH a falhar e exige que a tela conte a verdade.
 */

const managerEmail = process.env.E2E_MANAGER_EMAIL || 'gestor.e2e@test.local';
const password = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

test.describe('a interface não declara sucesso sem confirmação do servidor', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    await resetLifecycleFixtures();
  });

  test('PATCH falhando: cancelamento mostra erro, não sucesso — e a OS continua ativa', async ({
    page,
  }) => {
    await loginWithPassword(page, managerEmail, password);

    const ticketId = LIFECYCLE_TICKET_IDS.payment;
    const estadoInicial = await readTicketState(ticketId);
    expect(estadoInicial?.status).not.toBe('Cancelada');

    await page.getByTitle('Caixa de Entrada').click();
    await page.getByText(ticketId, { exact: false }).first().click();

    // Só o PATCH é derrubado: o resto da tela continua funcionando, então o teste
    // isola exatamente o caminho de gravação.
    await page.route('**/api/tickets**', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Falha simulada de persistência.' }),
        });
        return;
      }
      await route.fallback();
    });

    await page.getByRole('button', { name: 'Ações da OS' }).click();
    await page.getByRole('button', { name: 'Cancelar OS' }).click();

    const motivo = page.locator('#confirm-modal-reason');
    await expect(motivo).toBeVisible();
    await motivo.fill('Teste de falha de persistência');
    await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();

    // A afirmação central: a tela NÃO pode dizer que cancelou.
    await expect(page.getByText(/não foi cancelada|falha ao cancelar/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(`OS ${ticketId} cancelada.`)).toHaveCount(0);

    // E a prova de que o toast estaria mentindo: o dado não mudou.
    const estadoFinal = await readTicketState(ticketId);
    expect(estadoFinal?.status).toBe(estadoInicial?.status);
    expect(estadoFinal?.status).not.toBe('Cancelada');
  });

  test('sem interferência, o mesmo cancelamento conclui e persiste', async ({ page }) => {
    await loginWithPassword(page, managerEmail, password);

    const ticketId = LIFECYCLE_TICKET_IDS.payment;
    await page.getByTitle('Caixa de Entrada').click();
    await page.getByText(ticketId, { exact: false }).first().click();

    await page.getByRole('button', { name: 'Ações da OS' }).click();
    await page.getByRole('button', { name: 'Cancelar OS' }).click();

    const motivo = page.locator('#confirm-modal-reason');
    await expect(motivo).toBeVisible();
    await motivo.fill('Cancelamento legítimo do teste');
    await page.getByRole('button', { name: 'Confirmar cancelamento' }).click();

    await expect(page.getByText(`OS ${ticketId} cancelada.`)).toBeVisible({ timeout: 10000 });
    const estadoFinal = await readTicketState(ticketId);
    expect(estadoFinal?.status).toBe('Cancelada');
  });
});
