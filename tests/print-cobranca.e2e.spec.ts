import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/** Não é teste: é o print do quadro de cobrança no painel, para o dono olhar. */
test.setTimeout(120000);

test('print do quadro de cobrança', async ({ page }) => {
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await loginWithPassword(page, 'admin@test.local', 'Test@123456');
  await page.getByRole('button', { name: /^Indicadores$/ }).first().click();
  await page.waitForTimeout(6000);

  const quadro = page.locator('div.bg-roman-surface').filter({ hasText: 'Cobrança de quem não apareceu' }).first();
  await quadro.scrollIntoViewIfNeeded();
  await page.getByText('POR 100 VISITAS').waitFor();
  await page.waitForTimeout(500);
  await quadro.screenshot({ path: 'prints/quadro-cobranca.png' });
  console.log('TEXTO:', (await quadro.innerText()).replace(/\n+/g, ' | '));
  expect(true).toBe(true);
});
