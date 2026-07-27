import { expect, test } from '@playwright/test';

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
  await page.getByLabel('Assunto (Apenas 1 problema por formulário)').fill('Teste do formulário público');
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
