import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/** Não é teste: print dos cartões da tela Hoje, para o dono ver o título novo. */
test.setTimeout(120000);

test('print dos cartões', async ({ page }) => {
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await loginWithPassword(page, 'admin@test.local', 'Test@123456');
  await page.getByRole('button', { name: /^Hoje$/ }).first().click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'prints/hoje-cards.png', fullPage: false });

  const titulos = await page.evaluate(() =>
    [...document.querySelectorAll('.font-semibold.text-roman-text-main')]
      .map(e => e.textContent?.trim())
      .filter(Boolean)
      .slice(0, 6)
  );
  console.log('TITULOS:', JSON.stringify(titulos));
  expect(true).toBe(true);
});
