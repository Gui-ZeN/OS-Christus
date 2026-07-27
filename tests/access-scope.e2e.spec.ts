import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

const loginEmail = process.env.E2E_TERRITORY_USER_EMAIL || 'usuario.pe@test.local';
const loginPassword = process.env.E2E_TERRITORY_USER_PASSWORD || 'Test@123456';

test('Usuário vinculado à sede PE não visualiza outras sedes da mesma região', async ({ page }) => {
  await loginWithPassword(page, loginEmail, loginPassword);

  await expect(
    page.getByRole('heading', { name: 'Painel de Tickets da Minha Estrutura' })
  ).toBeVisible();

  const ticketTable = page.locator('table').first();
  const peTicketRow = ticketTable.getByRole('row').filter({ hasText: 'OS-0007' });
  await expect(peTicketRow.getByText('OS-0007', { exact: true })).toBeVisible();
  await expect(peTicketRow.getByText('PE', { exact: true })).toBeVisible();
  await expect(ticketTable.getByText('OS-0001', { exact: true })).toHaveCount(0);
  await expect(ticketTable.getByText('PQL3', { exact: true })).toHaveCount(0);
  await expect(ticketTable.getByText('DL', { exact: true })).toHaveCount(0);

  await page.getByTitle('Indicadores').click();
  await expect(page.getByRole('heading', { name: 'Painel Executivo' })).toBeVisible();
});
