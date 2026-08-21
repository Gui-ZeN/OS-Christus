import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/**
 * VARREDURA DE ACESSIBILIDADE — todas as telas, todas as regras WCAG 2.1 AA.
 *
 * `foco-visivel` e `alvo-de-clique` cobrem UMA norma cada, escolhida a dedo depois
 * que alguém reparou no problema. O mesmo limite da lista de autorização escrita à
 * mão: a tela nova de amanhã não está nela, e ninguém percebe que não está.
 *
 * Aqui as telas são DESCOBERTAS na barra lateral em tempo de execução. Tela nova
 * entra na varredura no dia em que aparece no menu — e, de brinde, a varredura se
 * ajusta ao papel de quem entrou, porque a barra já é montada por permissão.
 *
 * ⚠️ O QUE ISTO NÃO É. Axe pega o que dá para checar por máquina — rótulo ausente,
 * contraste, ARIA inválida, ordem de cabeçalho. Ele não diz se o texto faz sentido,
 * se o fluxo é razoável, nem se a mensagem de erro ajuda. Passar aqui não é ser
 * acessível; é não ter os defeitos que uma máquina consegue nomear.
 */

const loginEmail = process.env.E2E_LOGIN_EMAIL || 'admin@test.local';
const loginPassword = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

/**
 * WCAG 2.1 nível AA — o mesmo alvo que `alvo-de-clique` já adota. `best-practice`
 * fica FORA: é conselho de usabilidade, não norma, e misturar os dois faz a suíte
 * cobrar do time coisas que ninguém acordou em cumprir.
 */
const NORMAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Só o que quebra o uso. `minor` vira ruído e ensina a ignorar o vermelho. */
const GRAVIDADES = new Set(['critical', 'serious']);

interface Achado {
  tela: string;
  regra: string;
  gravidade: string;
  quantos: number;
  medida: string;
  exemplo: string;
}

/**
 * O NUMERO, quando existe.
 *
 * "Tem problema de contraste" nao da para agir. "Mede 2,9:1 e a norma pede 4,5:1"
 * da: diz o quanto falta e permite conferir a correcao. O axe carrega esses valores
 * em `any[].data`, e quase todo relatorio os joga fora.
 */
function medidaDe(no: { any?: Array<{ data?: unknown }> }): string {
  for (const check of no.any || []) {
    const dados = check.data as { contrastRatio?: number; expectedContrastRatio?: string } | undefined;
    if (dados?.contrastRatio != null) {
      const obtido = String(dados.contrastRatio).replace('.', ',');
      return `${obtido}:1 (norma: ${dados.expectedContrastRatio ?? '4.5:1'})`;
    }
  }
  return '';
}

async function varrer(page: Page, tela: string): Promise<Achado[]> {
  const resultado = await new AxeBuilder({ page }).withTags(NORMAS).analyze();
  return resultado.violations
    .filter(v => GRAVIDADES.has(String(v.impact)))
    .map(v => ({
      tela,
      regra: v.id,
      gravidade: String(v.impact),
      quantos: v.nodes.length,
      medida: medidaDe(v.nodes[0] as { any?: Array<{ data?: unknown }> }),
      exemplo: String(v.nodes[0]?.target?.[0] ?? '').slice(0, 60),
    }));
}

/**
 * PENDENCIAS CONHECIDAS, uma a uma justificada e com o numero medido.
 *
 * Mesmo desenho da lista de portas publicas da matriz de autorizacao: o que esta
 * aqui é uma divida ACEITA e visivel; o que nao esta reprova a suite. Sem isto, a
 * varredura vira um relatorio impresso que ninguem compara -- e relatorio que
 * ninguem compara nao protege nada.
 *
 * Cada linha carrega a medida atual de proposito: se piorar, o numero no diff
 * denuncia; se melhorar ate a norma, a linha sai daqui.
 */
const PENDENCIAS = [
  {
    regra: 'color-contrast',
    seletor: 'text-\\[9px\\]',
    medida: '2,37:1 a 2,94:1 (norma 4,5:1)',
    motivo:
      'rotulo do item ATIVO da barra lateral: `text-roman-primary` (o dourado da marca) ' +
      'sobre a superficie a 7%. Ironia da coisa: o nome da tela em que a pessoa esta é o ' +
      'texto menos legivel da barra. O conserto natural é o rotulo virar branco e o ' +
      'dourado ficar so no icone e na barrinha lateral -- que sao elementos graficos e ' +
      'respondem a 3:1, nao a 4,5:1. Mexe na identidade visual da navegacao, entao é ' +
      'decisao sua, nao minha.',
  },
];

function ehPendenciaConhecida(achado: Achado) {
  return PENDENCIAS.some(p => achado.regra === p.regra && achado.exemplo.includes(p.seletor));
}

function relatar(achados: Achado[]) {
  if (achados.length === 0) {
    console.log('\nNenhuma violação crítica ou séria.\n');
    return;
  }
  console.log(`\n── ${achados.length} violações (crítica/séria) ──`);
  console.table(achados);

  const porRegra = new Map<string, number>();
  for (const a of achados) porRegra.set(a.regra, (porRegra.get(a.regra) || 0) + a.quantos);
  console.log('── por regra ──');
  console.table([...porRegra.entries()].map(([regra, ocorrencias]) => ({ regra, ocorrencias })));
}

test('varredura WCAG em todas as telas do Admin', async ({ page }) => {
  test.setTimeout(180000);
  await loginWithPassword(page, loginEmail, loginPassword);

  // As telas vêm da própria barra lateral: nada de lista digitada que envelhece.
  const telas = await page.locator('nav button[title]').evaluateAll(botoes =>
    botoes.map(b => b.getAttribute('title') || '').filter(Boolean)
  );
  expect(telas.length, 'a barra lateral precisa ter telas para varrer').toBeGreaterThan(3);
  console.log(`\ntelas descobertas: ${telas.join(', ')}`);

  const achados: Achado[] = [];
  for (const tela of telas) {
    await page.getByTitle(tela, { exact: true }).click();
    // Sem espera, o axe mede a tela ainda montando e acusa problema que não existe.
    await page.waitForLoadState('networkidle').catch(() => {});
    achados.push(...(await varrer(page, tela)));
  }

  relatar(achados);

  const novas = achados.filter(a => !ehPendenciaConhecida(a));
  expect(
    novas,
    `violação fora da lista de pendências: ${novas.map(a => `${a.tela}/${a.regra} ${a.medida}`).join(' | ')}`
  ).toEqual([]);
});

test('varredura WCAG na porta pública: login e formulário', async ({ page }) => {
  test.setTimeout(120000);
  const achados: Achado[] = [];

  // Estas duas telas pesam mais que as internas: quem as usa não tem conta, não teve
  // treinamento e não tem a quem pedir ajuda quando algo não funciona.
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  achados.push(...(await varrer(page, 'login')));

  // O formulário não tem URL própria: abre por botão na mesma página do login.
  await page.getByRole('button', { name: /abrir chamado/i }).click();
  await expect(page.getByRole('heading', { name: 'Nova Ordem de Serviço' })).toBeVisible();
  achados.push(...(await varrer(page, 'formulário público')));

  relatar(achados);

  // A porta publica não tem pendência aceita: quem a usa não tem conta, não teve
  // treinamento e não tem a quem pedir ajuda. Aqui o piso é zero.
  expect(
    achados,
    `a porta pública precisa ficar limpa: ${achados.map(a => `${a.tela}/${a.regra}`).join(' | ')}`
  ).toEqual([]);
});
