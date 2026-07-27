import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

const loginEmail = process.env.E2E_LOGIN_EMAIL || 'admin@test.local';
const loginPassword = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

test('login e navegação principal do Admin', async ({ page }) => {
  await loginWithPassword(page, loginEmail, loginPassword);

  await page.getByTitle('Caixa de Entrada').click();
  await expect(page.getByRole('heading', { name: 'Caixa de Entrada' })).toBeVisible();

  await page.getByTitle('Configurações').click();
  await expect(page.getByRole('heading', { name: 'Estrutura e governança' })).toBeVisible();

  await page.getByTitle('Indicadores').click();
  await expect(page.getByRole('heading', { name: 'Painel Executivo' })).toBeVisible();
});

test('notificações e responsividade básica em 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginWithPassword(page, loginEmail, loginPassword);

  // exact: o popover tem também "Atualizar notificações" — sem isto o seletor casa
  // dois elementos e o Playwright falha por strict mode.
  const notificationButton = page.getByTitle('Notificações', { exact: true });
  await notificationButton.click();
  await expect(page.getByRole('heading', { name: 'Notificações' })).toBeVisible();
  await notificationButton.click();

  await page.getByTitle('Caixa de Entrada').click();
  await expect(page.getByRole('heading', { name: 'Caixa de Entrada' })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(hasHorizontalOverflow).toBe(false);
});
