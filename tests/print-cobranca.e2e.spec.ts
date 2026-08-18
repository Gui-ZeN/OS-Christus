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
  await page.getByText('SEM RESPOSTA').waitFor();
  await page.waitForTimeout(500);
  await quadro.screenshot({ path: 'prints/quadro-cobranca.png' });
  console.log('EQUIPE:', (await quadro.innerText()).replace(/\s*\n\s*/g, ' | '));

  const seletor = page.getByLabel('Filtrar por quem cobrou');
  await seletor.selectOption({ index: 1 });
  await page.waitForTimeout(500);
  await quadro.screenshot({ path: 'prints/quadro-cobranca-por-pessoa.png' });
  console.log('PESSOA:', (await quadro.innerText()).replace(/\s*\n\s*/g, ' | '));

  // O quadro obedece aos filtros do topo da tela? (era o defeito: não obedecia)
  await seletor.selectOption({ index: 0 });
  const sedes = page.getByLabel('Filtrar por sede');
  for (const sede of ['PE', 'DL']) {
    await sedes.selectOption(sede);
    await page.waitForTimeout(400);
    const texto = (await quadro.innerText()).split('\n').join(' ');
    console.log(`SEDE ${sede}:`, texto.replace(/\s*\n\s*/g, ' | ').slice(0, 220));
  }

  expect(true).toBe(true);
});
