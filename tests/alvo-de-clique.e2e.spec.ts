import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/**
 * GUARDA DO ALVO DE CLIQUE (WCAG 2.5.8, nível AA na 2.2).
 *
 * A norma pede **24×24 px CSS**. A medição encontrou 15 controles abaixo disso:
 * ícones de 16×16 sem área ao redor na Caixa de Entrada, "Editar"/"Excluir" de
 * 20px de altura em Acessos, e o rótulo de um checkbox na Gestão.
 *
 * O Sol recomendou 36–40px, mas isso é conselho de usabilidade, não norma — e
 * engordar os 111 controles que hoje vivem entre 24 e 36 quebraria a tabela da
 * Gestão, que cabe com **folga zero** em 1280px. Este teste cobra o mínimo da
 * norma, que é o que dá para garantir sem desfazer a densidade.
 *
 * Duas escolhas de medição que mudam o resultado:
 *
 *  1. **O alvo de um checkbox é o `<label>` que o envolve**, não o `<input>`.
 *     Clicar no rótulo aciona o controle, então medir só a caixinha de 14px
 *     acusa um defeito que não existe.
 *  2. Só conta o que está **visível**: `offsetParent === null` derruba menu
 *     fechado, aba inativa e modal não aberto, que não são alvo de ninguém.
 */

const loginEmail = process.env.E2E_LOGIN_EMAIL || 'admin@test.local';
const loginPassword = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

/** WCAG 2.5.8 — Target Size (Minimum). */
const MINIMO = 24;

const SONDA = `(() => {
  const visivel = el => el.offsetParent !== null;
  const alvos = [...document.querySelector('main').querySelectorAll(
    'button, a[href], [role="button"], [role="checkbox"], label:has(input), select'
  )].filter(visivel);

  return alvos.map(el => {
    const r = el.getBoundingClientRect();
    return {
      largura: Math.round(r.width),
      altura: Math.round(r.height),
      menor: Math.round(Math.min(r.width, r.height)),
      texto: (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().slice(0, 30),
    };
  });
})()`;

type Alvo = { largura: number; altura: number; menor: number; texto: string };

for (const tela of ['Hoje', 'Caixa de Entrada', 'Gestão de OS', 'Configurações', 'Auditoria']) {
  test(`os controles de ${tela} têm ao menos ${MINIMO}px`, async ({ page }) => {
    await loginWithPassword(page, loginEmail, loginPassword);
    await page.getByTitle(tela, { exact: true }).click();
    await page.waitForTimeout(1200);

    /**
     * Desligar animação ANTES de medir não é detalhe: é a diferença entre medir o
     * controle e medir um quadro dele. Animação de entrada costuma escalar de 95%
     * para 100%, e um alvo de 24px lido no meio disso reporta 22 — defeito que não
     * existe. É a mesma armadilha que `transition-colors` armou na guarda de foco,
     * onde o contorno era lido no ponto de partida da transição.
     */
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });

    /**
     * E ainda assim mede até estabilizar: uma espera fixa pega a tela no meio da
     * montagem, e controle sem conteúdo mede menos do que vai medir. Duas leituras
     * iguais seguidas valem; se nunca estabilizar, a última vale e o teste cobra
     * dela. Guarda que falha à toa é guarda que o time aprende a ignorar.
     */
    let alvos: Alvo[] = [];
    let anterior = '';
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      alvos = (await page.evaluate(SONDA)) as Alvo[];
      const assinatura = JSON.stringify(alvos.map(a => a.menor));
      if (assinatura === anterior) break;
      anterior = assinatura;
      await page.waitForTimeout(300);
    }

    expect(alvos.length, `${tela}: nenhum controle encontrado — o teste não mediu nada`).toBeGreaterThan(3);

    const pequenos = alvos.filter(a => a.menor < MINIMO);
    expect(
      pequenos,
      `${tela}: controles abaixo de ${MINIMO}px\n${pequenos.map(a => `  ${a.texto || '(sem rótulo)'} — ${a.largura}x${a.altura}`).join('\n')}`,
    ).toEqual([]);
  });
}
