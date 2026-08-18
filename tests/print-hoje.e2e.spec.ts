import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/**
 * Não é teste: é o print da tela "Hoje" reestruturada, para o dono olhar.
 *
 * Mede junto o que a decisão de 13/08 mediu ao remover a fileira de contadores —
 * altura ocupada e onde o primeiro dado começa —, para a volta dela ser avaliada
 * pelo mesmo critério que a tirou.
 */
test.setTimeout(120000);

test('print da tela Hoje', async ({ page }) => {
  page.on('console', m => {
    if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300));
  });
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
  await loginWithPassword(page, 'admin@test.local', 'Test@123456');
  // `?view=today` não está na lista de views aceitas por query — a tela "Hoje" se
  // alcança pelo menu, que é como a gestora chega nela de manhã.
  await page.getByRole('button', { name: /^Hoje$/ }).first().click();
  await page.waitForTimeout(6000);

  await page.screenshot({ path: 'prints/tela-hoje.png', fullPage: false });

  const medida = await page.evaluate(() => ({
    grupos: [...document.querySelectorAll('section[id^="grupo-"] h2')].map(h => h.textContent?.trim()),
    contadores: [...document.querySelectorAll('button')]
      .map(b => b.textContent?.trim())
      .filter(t => /Hoje ·|Vencidas|Próximos 7 dias|Sem próxima ação/.test(t || '')),
    primeiroDadoEm: (() => {
      const s = document.querySelector('section[id^="grupo-"]');
      return s ? Math.round(s.getBoundingClientRect().top) : null;
    })(),
  }));
  console.log('MEDIDA:', JSON.stringify(medida, null, 2));
  expect(true).toBe(true);
});
