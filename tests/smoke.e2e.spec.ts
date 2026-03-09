import { expect, test } from '@playwright/test';

const loginEmail = process.env.E2E_LOGIN_EMAIL;
const loginPassword = process.env.E2E_LOGIN_PASSWORD;

async function login(page: import('@playwright/test').Page) {
  test.skip(!loginEmail || !loginPassword, 'Defina E2E_LOGIN_EMAIL e E2E_LOGIN_PASSWORD para executar os smoke tests.');

  await page.goto('/');
  await page.getByRole('button', { name: /acesso/i }).click();
  await page.locator('input[type="email"]').fill(loginEmail!);
  await page.locator('input[type="password"]').fill(loginPassword!);
  await page.getByRole('button', { name: /acessar o sistema/i }).click();
  await expect(page.getByText(/olá,/i)).toBeVisible();
}

test('login e navegacao principal', async ({ page }) => {
  await login(page);

  await page.locator('button[title="Caixa de Entrada"]').click();
  await expect(page.getByText(/Caixa de Entrada/i)).toBeVisible();

  await page.locator('button[title="Configurações"]').click();
  await expect(page.getByRole('heading', { name: /configurações do sistema/i })).toBeVisible();

  await page.locator('button[title="KPI"]').click();
  await expect(page.getByRole('heading', { name: /indicadores|kpi/i })).toBeVisible();
});

test('notificacoes e responsividade basica', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await page.locator('button[title="Notificações"]').click();
  await expect(page.getByRole('heading', { name: /notificações/i })).toBeVisible();
  await page.getByLabel(/fechar notificações/i).click();

  await page.locator('button[title="Caixa de Entrada"]').click();
  await expect(page.getByText(/Caixa de Entrada/i)).toBeVisible();
});
