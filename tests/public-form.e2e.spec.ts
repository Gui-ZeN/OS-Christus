import { expect, test } from '@playwright/test';
import { apagarOsPorAssunto } from './e2e/lifecycle-state';

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
