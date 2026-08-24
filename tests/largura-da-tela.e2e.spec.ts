import { expect, test, type Page } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/**
 * NADA PODE FICAR INALCANÇÁVEL FORA DA BORDA — em nenhuma largura, em nenhuma tela.
 *
 * ⚠️ A PRIMEIRA VERSÃO DESTE TESTE MEDIA A COISA ERRADA, e passava com 28 telas
 * verdes sem valer nada. Ela perguntava se a PÁGINA rolava na horizontal
 * (`documentElement.scrollWidth > clientWidth`). Só que `html`, `body` e os divs
 * raiz deste app têm `overflow: hidden` — é layout de altura fixa com rolagem
 * interna, e a página NÃO PODE rolar por construção. A propriedade era impossível
 * de violar. Descoberto plantando um elemento de 2000px numa janela de 1280 e vendo
 * a medida responder "sobra 0".
 *
 * E a descoberta apontou a propriedade que importa de verdade AQUI: com o transbordo
 * escondido na raiz, o que passa da borda não vira rolagem — vira conteúdo
 * INALCANÇÁVEL. Não há barra para chegar nele. É pior que rolar: some sem sintoma.
 *
 * A distinção que faz a medida valer: conteúdo largo DENTRO de um contêiner que rola
 * (`overflow-x: auto`) está correto e proposital — a tabela da Gestão é assim. O
 * que este teste cobra é o que passa da borda SEM ter como chegar lá.
 *
 * Por que agora: o comentário de `alvo-de-clique` registra que a tabela da Gestão
 * cabe com "folga zero" em 1280px. Folga zero é o estado anterior a estourar.
 *
 * As telas saem da barra lateral em tempo de execução, igual à varredura WCAG.
 */

const loginEmail = process.env.E2E_LOGIN_EMAIL || 'admin@test.local';
const loginPassword = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

/**
 * As larguras que a operação usa de verdade.
 *
 * 1280 é a mais importante e a menos óbvia: é o notebook comum, onde a tabela da
 * Gestão já cabe raspando. 390 é o celular do solicitante; 768 é o tablet da
 * recepção; 1920 é o monitor da sala.
 */
const LARGURAS = [
  { nome: 'celular', largura: 390, altura: 844 },
  { nome: 'tablet', largura: 768, altura: 1024 },
  { nome: 'notebook', largura: 1280, altura: 800 },
  { nome: 'monitor', largura: 1920, altura: 1080 },
];

interface Estouro {
  tela: string;
  largura: string;
  sobra: number;
  culpado: string;
}

/**
 * Acha o que passa da borda direita SEM ter como ser alcançado.
 *
 * Sobe pelos ancestrais: se algum deles rola na horizontal (`auto`/`scroll`), o
 * conteúdo largo está acessível e é proposital — cai fora do relatório.
 *
 * E APONTA O CULPADO: "algo está fora da tela" não dá para consertar; "o elemento
 * `table.min-w-...` passa 148px da borda" dá.
 */
/**
 * ⚠️ MEDIR DURANTE UMA ANIMAÇÃO DÁ NÚMERO FALSO.
 *
 * O painel lateral da Caixa de Entrada desliza. Parado, ele está inteiro fora da
 * tela (e a regra da gaveta o ignora); no MEIO do deslize, ele atravessa a borda e
 * vira "conteúdo inalcançável". Resultado: a suíte reprovava em 2 de 3 rodadas, com
 * números diferentes a cada vez (+260px, +206px, +58px) — e o valor mudando é a
 * assinatura de estar medindo algo em movimento.
 *
 * `document.getAnimations()` inclui transições CSS: esperar todas saírem de
 * `running` é genérico e não depende de saber quais animações a tela tem.
 */
async function aguardarAnimacoes(page: Page) {
  await page
    .waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'), null, {
      timeout: 5000,
    })
    .catch(() => {});
}

async function medirUmaVez(page: Page) {
  return page.evaluate(() => {
    const limite = document.documentElement.clientWidth;
    const TOLERANCIA = 2; // arredondamento de subpixel não é defeito

    const rolaNaHorizontal = (el: Element) => {
      const overflow = getComputedStyle(el as HTMLElement).overflowX;
      return overflow === 'auto' || overflow === 'scroll';
    };

    let pior = { excesso: 0, descricao: '' };

    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const caixa = el.getBoundingClientRect();
      if (caixa.width === 0 || caixa.height === 0) continue;

      const excesso = Math.round(caixa.right - limite);
      if (excesso <= TOLERANCIA) continue;

      /**
       * ⚠️ GAVETA FECHADA NÃO É CONTEÚDO PERDIDO.
       *
       * Painel lateral que desliza fica ESTACIONADO fora da tela quando fechado
       * (`aside.fixed.inset-y-0.right-0`, 260px além da borda). É padrão, não
       * defeito — e a primeira versão acusava, mas só às vezes: dependia de um
       * teste anterior ter deixado o painel montado. Vermelho que aparece e some
       * conforme a ordem da suíte é o que ensina o time a ignorar vermelho.
       *
       * A distinção: gaveta fechada fica INTEIRAMENTE fora (começa na borda ou
       * depois dela); conteúdo clipado ATRAVESSA a borda — começa visível e o resto
       * some. Só o segundo é perda.
       */
      if (caixa.left >= limite - TOLERANCIA) continue;

      const estilo = getComputedStyle(el);
      if (estilo.visibility === 'hidden' || estilo.opacity === '0') continue;
      // Decorativo e escondido de leitor de tela não é conteúdo perdido.
      if (el.closest('[aria-hidden="true"]')) continue;

      // Alcançável por rolagem de algum ancestral? Então está tudo certo.
      let alcancavel = false;
      let pai: Element | null = el.parentElement;
      while (pai && pai !== document.body) {
        if (rolaNaHorizontal(pai)) { alcancavel = true; break; }
        pai = pai.parentElement;
      }
      if (alcancavel) continue;

      if (excesso > pior.excesso) {
        const classes = String(el.className || '').split(/\s+/).slice(0, 3).join('.');
        pior = {
          excesso,
          descricao: `${el.tagName.toLowerCase()}${classes ? '.' + classes : ''}`.slice(0, 70),
        };
      }
    }

    return { sobra: pior.excesso, culpado: pior.descricao };
  });
}

/**
 * SÓ CONTA O QUE PERSISTE — duas medidas, mesmo culpado nas duas.
 *
 * Esperar `document.getAnimations()` ajudou, mas não bastou: sobrava 1 reprovação a
 * cada 3 rodadas, sempre no painel lateral da Caixa de Entrada e sempre com número
 * diferente (+260px, +206px, +58px). Valor que muda a cada rodada é a assinatura de
 * estado transitório, e o estado dependia do que o teste ANTERIOR da suíte tinha
 * deixado aberto.
 *
 * Duas amostras com um intervalo curto resolvem sem depender de saber quais
 * animações existem: o que está de passagem some entre uma e outra; o que está
 * realmente fora da borda continua lá. Perder um defeito que dure menos de 400ms é
 * um preço barato — vermelho intermitente custa mais, porque ensina a ignorar o
 * vermelho.
 */
async function medirEstouro(page: Page) {
  const primeira = await medirUmaVez(page);
  if (primeira.sobra === 0) return primeira;

  await page.waitForTimeout(400);
  const segunda = await medirUmaVez(page);

  if (segunda.culpado !== primeira.culpado) return { sobra: 0, culpado: '' };
  return segunda;
}

/**
 * PENDÊNCIAS CONHECIDAS — mesmo desenho da varredura WCAG e da matriz de
 * autorização: o que está aqui é dívida aceita e visível; o que não está reprova.
 */
const PENDENCIAS: Array<{ tela: string; largura: string; motivo: string }> = [];

function ehPendencia(e: Estouro) {
  return PENDENCIAS.some(p => p.tela === e.tela && p.largura === e.largura);
}

test('nada fica inalcançável fora da borda, em nenhuma largura', async ({ page }) => {
  test.setTimeout(240000);
  await loginWithPassword(page, loginEmail, loginPassword);

  const telas = await page.locator('nav button[title]').evaluateAll(botoes =>
    botoes.map(b => b.getAttribute('title') || '').filter(Boolean)
  );
  expect(telas.length, 'a barra lateral precisa ter telas para medir').toBeGreaterThan(3);

  const estouros: Estouro[] = [];
  const medidas: Array<Record<string, string>> = [];

  for (const tela of telas) {
    const linha: Record<string, string> = { tela };
    for (const { nome, largura, altura } of LARGURAS) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.getByTitle(tela, { exact: true }).click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await aguardarAnimacoes(page);

      const { sobra, culpado } = await medirEstouro(page);
      linha[nome] = sobra > 0 ? `+${sobra}px` : 'ok';
      if (sobra > 0) estouros.push({ tela, largura: nome, sobra, culpado });
    }
    medidas.push(linha);
  }

  console.log('\n── conteúdo fora da borda, por tela e largura ──');
  console.table(medidas);

  if (estouros.length > 0) {
    console.log('── quem está estourando ──');
    console.table(estouros);
  }

  const novos = estouros.filter(e => !ehPendencia(e));
  expect(
    novos,
    `conteúdo inalcançável fora da borda: ${novos
      .map(e => `${e.tela} em ${e.largura} (+${e.sobra}px, ${e.culpado})`)
      .join(' | ')}`
  ).toEqual([]);
});

test('a porta pública cabe no celular', async ({ page }) => {
  // O formulário público é usado do celular, em pé, por quem está olhando o
  // problema na parede. É a largura que mais importa dele.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await aguardarAnimacoes(page);

  const login = await medirEstouro(page);
  expect(login.sobra, `o login joga ${login.sobra}px fora da borda (${login.culpado})`).toBe(0);

  await page.getByRole('button', { name: /abrir chamado/i }).click();
  await expect(page.getByRole('heading', { name: 'Nova Ordem de Serviço' })).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => {});
  await aguardarAnimacoes(page);

  const formulario = await medirEstouro(page);
  expect(
    formulario.sobra,
    `o formulário público joga ${formulario.sobra}px fora da borda (${formulario.culpado})`
  ).toBe(0);
});
