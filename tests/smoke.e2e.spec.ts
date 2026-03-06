import { expect, test } from '@playwright/test';

async function loginAsManager(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /acesso/i }).click();
  await page.locator('input[type="email"]').fill('admin@os-christus.local');
  await page.locator('input[type="password"]').fill('qualquer-coisa');
  await page.getByRole('button', { name: /acessar o sistema/i }).click();
  await expect(page.getByText(/olá, administrador os christus/i)).toBeVisible();
}

test('login and sidebar navigation smoke', async ({ page }) => {
  await loginAsManager(page);

  await page.locator('button[title="Caixa de Entrada"]').click();
  await expect(page.getByText(/Minhas Filas/i)).toBeVisible();

  await page.locator('button[title="Painel da Diretoria"]').click();
  await expect(page.getByRole('heading', { name: /painel da diretoria/i })).toBeVisible();

  await page.locator('button[title="Financeiro"]').click();
  await expect(page.getByRole('heading', { name: /painel financeiro/i })).toBeVisible();
});

test('inbox actions and modals smoke', async ({ page }) => {
  await loginAsManager(page);
  await page.locator('button[title="Caixa de Entrada"]').click();
  await expect(page.getByText(/Minhas Filas/i)).toBeVisible();

  await page.getByLabel('Ações da OS').click();
  await page.getByRole('button', { name: /duplicar os/i }).click();
  await expect(page.getByText(/duplicada como/i)).toBeVisible();

  await page.getByText('OS-0047').first().click();
  await page.getByRole('button', { name: /gerenciar cotações/i }).click();
  await expect(page.getByText(/preencha os dados dos 3 orçamentos obrigatórios/i)).toBeVisible();
  await page.getByRole('button', { name: /fechar/i }).click();

  await page.getByText('OS-0044').first().click();
  await page.getByRole('button', { name: /ações preliminares \(compras\)/i }).click();
  await expect(page.getByRole('heading', { name: /ações preliminares/i })).toBeVisible();
  const prelimModal = page.locator('div.fixed').filter({ hasText: /ações preliminares/i });
  await prelimModal.getByRole('button', { name: /cancelar/i }).click();
});

test('notifications and tracking smoke', async ({ page }) => {
  await loginAsManager(page);
  await page.locator('button[title="Caixa de Entrada"]').click();

  await page.locator('button[title="Notificações"]').click();
  await expect(page.getByRole('heading', { name: /notificações/i })).toBeVisible();
  await page.getByLabel(/fechar notificações/i).click();

  await page.locator('button[title="Visualizar como solicitante"]').click();
  await expect(page.getByRole('heading', { name: /acompanhamento de os/i })).toBeVisible();
  await page.getByRole('button', { name: /voltar ao sistema interno/i }).click();
  await expect(page.getByText(/Minhas Filas/i)).toBeVisible();
});

test('mobile drawers and modal dismissal smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsManager(page);
  await page.locator('button[title="Caixa de Entrada"]').click();
  await expect(page.getByText(/Minhas Filas/i)).toBeVisible();

  await page.getByRole('button', { name: /^filas$/i }).click();
  await expect(page.getByLabel(/fechar lista/i)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^filas$/i })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: /^dados$/i }).click();
  await expect(page.getByLabel(/fechar painel de dados/i)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^dados$/i })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: /^filas$/i }).click();
  await page.getByText('OS-0047').first().click();
  await page.getByRole('button', { name: /^dados$/i }).click();
  await page.getByRole('button', { name: /gerenciar cotações/i }).click();
  await expect(page.getByRole('dialog', { name: /gestão de orçamentos/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /gestão de orçamentos/i })).toHaveCount(0);
});
