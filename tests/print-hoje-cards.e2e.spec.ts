import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/** Não é teste: print da tela Hoje com o filtro de sede, para o dono ver. */
test.setTimeout(120000);

const leituraDaTela = () => ({
  contadores: [...document.querySelectorAll('button')]
    .map(b => b.textContent?.trim().replace(/\s+/g, ' '))
    .filter(t => /Hoje ·|Vencidas|Próximos 7 dias|Sem próxima ação/.test(t || '')),
  titulos: [...document.querySelectorAll('.font-semibold.text-roman-text-main')]
    .map(e => e.textContent?.trim())
    .filter(Boolean),
});

test('print da tela Hoje com filtro de sede', async ({ page }) => {
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await loginWithPassword(page, 'admin@test.local', 'Test@123456');
  await page.getByRole('button', { name: /^Hoje$/ }).first().click();
  await page.waitForTimeout(5000);

  const seletor = page.getByLabel('Filtrar a agenda por sede');
  console.log('OPCOES:', JSON.stringify(await seletor.locator('option').allInnerTexts()));
  await page.screenshot({ path: 'prints/hoje-filtro-sede.png', fullPage: false });
  console.log('TODAS:', JSON.stringify(await page.evaluate(leituraDaTela)));

  await seletor.selectOption({ index: 1 });
  await page.waitForTimeout(600);
  const sede = await seletor.inputValue();
  console.log(`SEDE ${sede}:`, JSON.stringify(await page.evaluate(leituraDaTela)));
  await page.screenshot({ path: 'prints/hoje-filtro-sede-aplicado.png', fullPage: false });

  expect(true).toBe(true);
});
