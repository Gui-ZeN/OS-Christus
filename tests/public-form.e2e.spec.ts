import { expect, test } from '@playwright/test';
import { apagarOsPorAssunto, lerContadorDeOs } from './e2e/lifecycle-state';

/** O assunto é a chave da limpeza: por ele a OS criada aqui se distingue das outras. */
const ASSUNTO = 'Teste do formulário público';

/**
 * ⚠️ ESTE SPEC CRIA OS DE VERDADE, e por isso precisa desfazer.
 *
 * Ele é o terceiro na ordem do CI; cinco specs rodam depois dele no MESMO emulador.
 * Dois deles — `foco-visivel` e `alvo-de-clique` — medem a tela (onde o Tab para,
 * que tamanho tem cada controle) e não mutam nada: o que eles enxergam é
 * exatamente o que este aqui deixou para trás.
 *
 * Sem a limpeza, a suíte mede um alvo diferente a cada execução. Com ela, cada spec
 * começa do mesmo lugar.
 */
test.afterAll(async () => {
  await apagarOsPorAssunto(ASSUNTO);
});

test('formulário público cria OS em mobile sem exigir classificação interna', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /abrir chamado/i }).click();
  await expect(page.getByRole('heading', { name: 'Nova Ordem de Serviço' })).toBeVisible();

  const optionalClassification = page.locator('details').filter({ hasText: 'Classificação opcional' });
  await expect(optionalClassification).not.toHaveAttribute('open', '');

  await page.getByRole('button', { name: 'Registrar Ordem de Serviço' }).click();
  await expect(page.getByLabel('Seu Nome')).toBeFocused();
  await expect(page.getByText('Nome é obrigatório')).toBeVisible();

  await page.getByLabel('Seu Nome').fill('Solicitante E2E');
  await page.getByLabel('Seu E-mail (Para receber o link)').fill('solicitante.e2e@test.local');
  await page.getByLabel('Assunto (Apenas 1 problema por formulário)').fill(ASSUNTO);
  await page.getByLabel('Descrição Curta').fill('Validação determinística do formulário no emulador.');
  await page.getByLabel('Local', { exact: true }).fill('Recepção');
  await page.getByLabel('Detalhe do local').fill('Próximo à entrada principal');
  await page.getByLabel('Região').selectOption({ label: 'Universidade' });
  await page.getByLabel('Sede').selectOption({ label: 'Parque Ecológico (PE)' });

  await page.getByRole('button', { name: 'Registrar Ordem de Serviço' }).click();
  await expect(page.getByRole('heading', { name: 'OS Registrada com Sucesso!' })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(hasHorizontalOverflow).toBe(false);
});

/**
 * A RECUSA TAMBÉM É CONTRATO — e nesta tela ela vale mais que em qualquer outra.
 *
 * É a única porta sem login do sistema: quem digita aqui é a sede, o professor, o
 * terceiro que passou no corredor. Um formulário que aceita entrada torta enche a
 * operação de OS que ninguém consegue responder, e um que recusa sem dizer o quê
 * faz a pessoa desistir e mandar e-mail solto — que é o problema de origem do
 * Serv3.
 *
 * O teste feliz acima prova que dá para registrar. Este prova o resto.
 */
test('recusa entrada torta sem criar OS, e diz exatamente o que faltou', async ({ page }) => {
  const antes = await lerContadorDeOs();

  await page.goto('/');
  await page.getByRole('button', { name: /abrir chamado/i }).click();
  await expect(page.getByRole('heading', { name: 'Nova Ordem de Serviço' })).toBeVisible();

  // 1) E-mail com formato inválido é apontado no campo, não no envio.
  await page.getByLabel('Seu Nome').fill('Solicitante E2E');
  await page.getByLabel('Seu E-mail (Para receber o link)').fill('nao-e-email');
  await page.getByRole('button', { name: 'Registrar Ordem de Serviço' }).click();
  await expect(page.getByText('E-mail inválido')).toBeVisible();

  // 2) O interessado torto é NOMEADO. Engolir em silêncio faria a pessoa achar que
  //    avisou alguém que nunca soube.
  await page.getByLabel('Seu E-mail (Para receber o link)').fill('solicitante.e2e@test.local');
  await page.getByLabel(/pessoas interessadas/i).fill('ok@x.com.br, arroba-faltando');
  await page.getByRole('button', { name: 'Registrar Ordem de Serviço' }).click();
  await expect(page.getByText(/E-mail inválido: arroba-faltando/)).toBeVisible();

  // 3) Corrigido o e-mail, o que falta continua sendo cobrado — um a um, não em bloco.
  await page.getByLabel(/pessoas interessadas/i).fill('ok@x.com.br');
  await page.getByRole('button', { name: 'Registrar Ordem de Serviço' }).click();
  await expect(page.getByText('Assunto é obrigatório')).toBeVisible();

  // 4) E NADA foi criado. É a asserção que importa numa porta pública: recusar na
  //    tela não vale se o servidor já tiver gravado.
  await expect(page.getByRole('heading', { name: 'OS Registrada com Sucesso!' })).toBeHidden();
  expect(await lerContadorDeOs(), 'o contador de OS andou numa submissão recusada').toBe(antes);
});
