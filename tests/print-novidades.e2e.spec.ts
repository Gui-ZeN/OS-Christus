import { expect, test } from '@playwright/test';

/**
 * Não é teste: é o print do aviso de novidades, para o dono conferir o texto.
 *
 * Faz o login à mão em vez de usar `loginWithPassword`: o helper suprime o modal
 * de propósito (o overlay intercepta cliques e derrubava os specs), e aqui o modal
 * É o objeto do print.
 */
test.setTimeout(120000);

test('print das novidades', async ({ page }) => {
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await page.goto('/');
  await page.getByLabel('E-mail institucional').fill('admin@test.local');
  await page.getByLabel('Senha').fill('Test@123456');
  await page.getByRole('button', { name: /acessar o sistema/i }).click();

  const modal = page.getByRole('dialog').filter({ hasText: 'O Serv3 está mudando' });
  await modal.waitFor({ timeout: 40000 });
  await page.waitForTimeout(800);
  await modal.screenshot({ path: 'prints/novidades.png' });
  console.log('TEXTO:', (await modal.innerText()).replace(/\s*\n\s*/g, ' | '));
  expect(true).toBe(true);
});
