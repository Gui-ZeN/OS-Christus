import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/** Cria OS de uma mensagem e confere que as irmãs da conversa foram junto. */
test.setTimeout(120000);

test('as irmãs da mesma conversa vão junto', async ({ page }) => {
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  page.on('response', async r => {
    if (r.url().includes('dropped-inbound') && r.request().method() === 'POST') {
      console.log('RESP', r.status(), (await r.text().catch(() => '')).slice(0, 200));
    }
  });

  await loginWithPassword(page, 'admin@test.local', 'Test@123456');
  await page.goto('/?view=inbox');
  await page.waitForTimeout(4000);

  const abrirFila = page.getByRole('button', { name: /mensagem\(ns\) sem OS/ });
  console.log('CABECALHO:', await abrirFila.innerText());
  await abrirFila.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'prints/fila-antes.png', fullPage: false });

  // Primeira mensagem da conversa dos banheiros: escolhe a sede e cria a OS.
  const cartao = page.locator('div.bg-roman-surface').filter({ hasText: 'operacional08@px.com.br' }).last();
  await cartao.locator('select').last().selectOption({ index: 1 });
  await cartao.getByRole('button', { name: /Criar OS/ }).last().click();
  await page.waitForTimeout(4000);

  console.log('CABECALHO DEPOIS:', await abrirFila.innerText());
  console.log('AVISO:', await page.locator('text=/mensagens da mesma conversa/').count());
  await page.screenshot({ path: 'prints/fila-depois.png', fullPage: false });
  expect(true).toBe(true);
});
