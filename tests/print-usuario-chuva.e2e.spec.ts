import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/** Marca o aviso de chuva, salva e recarrega — o campo tem que voltar marcado. */
test.setTimeout(120000);

test('o aviso de chuva persiste no cadastro', async ({ page }) => {
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  page.on('request', r => {
    if (r.url().includes('/api/users') && r.method() !== 'GET') {
      console.log('REQ', r.method(), r.url(), String(r.postData()).slice(0, 300));
    }
  });
  page.on('response', async r => {
    if (r.url().includes('/api/users') && r.request().method() !== 'GET') {
      console.log('RESP', r.status(), (await r.text().catch(() => '')).slice(0, 200));
    }
  });

  await loginWithPassword(page, 'admin@test.local', 'Test@123456');
  await page.goto('/?view=users');
  await page.waitForTimeout(3000);

  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.waitForTimeout(1200);

  const caixa = page.locator('label', { hasText: 'Recebe o aviso de chuva' }).locator('input[type=checkbox]');
  console.log('ANTES:', await caixa.isChecked());
  await caixa.check();

  const salvar = page.getByRole('button', { name: /Salvar altera/i });
  console.log('BOTAO SALVAR encontrado:', await salvar.count(), '| habilitado:', await salvar.first().isEnabled());
  await salvar.first().click();
  await page.waitForTimeout(3000);

  // Recarrega e reabre: o campo tem que voltar marcado, senão a gravação foi só na tela.
  await page.reload();
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.waitForTimeout(1200);
  const depois = await page
    .locator('label', { hasText: 'Recebe o aviso de chuva' })
    .locator('input[type=checkbox]')
    .isChecked();
  console.log('DEPOIS DE RECARREGAR:', depois);
  expect(depois).toBe(true);
});
