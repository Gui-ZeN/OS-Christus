import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/**
 * GUARDA DO FOCO DE TECLADO (WCAG 2.4.7 e 1.4.11).
 *
 * O app tem 137 `focus:outline-none` espalhados. Quase todos são campos que
 * trocam a cor da borda no lugar do contorno — legítimo. Mas as linhas da
 * tabela da Gestão desligavam o contorno e deixavam como único sinal uma tinta
 * do acento a 10%, que mede **1,13:1**. Quem navega a tabela por teclado não
 * tinha como saber onde estava.
 *
 * Nenhuma medição feita pelo console pega isso: `element.focus()` por script não
 * ativa `:focus-visible`, e uma aba sem foco de janela nem sequer casa `:focus`.
 * Só Tab de verdade, num navegador de verdade, diz a verdade — por isso este
 * teste é E2E e não unitário.
 */

const loginEmail = process.env.E2E_LOGIN_EMAIL || 'admin@test.local';
const loginPassword = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

/** Mínimo da 1.4.11 para indicador de foco contra as cores adjacentes. */
const MINIMO = 3;

/**
 * Lê o elemento em foco e devolve a força do indicador. Roda no navegador, então
 * é uma string — a função inteira precisa ser autossuficiente.
 */
const SONDA = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);

  const canal = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const rgbDe = s => { const m = (s || '').match(/(\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
  const lum = a => 0.2126 * canal(a[0]) + 0.7152 * canal(a[1]) + 0.0722 * canal(a[2]);
  const ct = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
  const sobre = (f, fu) => (f[3] >= 1 ? f : f.map((v, i) => (i < 3 ? v * f[3] + fu[i] * (1 - f[3]) : 1)));

  let n = el.parentElement, fundo = [255, 255, 255, 1];
  while (n && n !== document.documentElement) {
    const c = rgbDe(getComputedStyle(n).backgroundColor);
    if (c && c[3] > 0) { fundo = c; break; }
    n = n.parentElement;
  }

  const temContorno = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const temAnel = cs.boxShadow && cs.boxShadow !== 'none';
  let razao = 0, via = 'nada';
  if (temContorno) { const c = rgbDe(cs.outlineColor); via = 'contorno'; razao = c ? ct(sobre(c, fundo), fundo) : 0; }
  else if (temAnel) { via = 'anel'; razao = 99; }
  else { const c = rgbDe(cs.borderTopColor); via = 'borda'; razao = c ? ct(sobre(c, fundo), fundo) : 0; }

  return {
    tag: el.tagName.toLowerCase(),
    via,
    razao,
    focusVisible: el.matches(':focus-visible'),
    texto: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 26),
  };
})()`;

type Parada = { tag: string; via: string; razao: number; focusVisible: boolean; texto: string };

for (const tela of ['Gestão de OS', 'Hoje', 'Caixa de Entrada']) {
  test(`quem navega ${tela} por teclado enxerga onde está`, async ({ page }) => {
    await loginWithPassword(page, loginEmail, loginPassword);
    await page.getByTitle(tela, { exact: true }).click();
    await page.waitForTimeout(1200);

    // Sem isto a medição mente, e mente de um jeito convincente: `transition-colors`
    // inclui `outline-color`, então ler o estilo logo depois do Tab pega a transição
    // no ponto de PARTIDA — que é `currentColor`. Um botão dourado com texto branco
    // reportava contorno branco sobre fundo branco, 1,04:1, e parecia defeito real.
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });

    const fracos: Parada[] = [];
    let paradas = 0;

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const s = (await page.evaluate(SONDA)) as Parada | null;
      if (!s) continue;
      paradas++;
      // Só cobra de quem o navegador considera foco visível por teclado. Campos de
      // texto casam `:focus-visible` sempre; botões só na navegação por teclado —
      // que é exatamente o caso aqui, já que a parada veio de um Tab.
      if (s.focusVisible && s.razao < MINIMO) fracos.push(s);
    }

    expect(paradas, `${tela}: o Tab não parou em lugar nenhum — o teste não mediu nada`).toBeGreaterThan(3);
    expect(fracos, `${tela}: sem indicador de foco de ${MINIMO}:1\n${JSON.stringify(fracos, null, 1)}`).toEqual([]);
  });
}
