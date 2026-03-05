import { expect, Page, test } from '@playwright/test';

async function loginAsManager(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /acesso/i }).click();
  await page.getByRole('button', { name: /acessar o sistema/i }).click();
  await expect(page.getByText(/olá, rafael/i)).toBeVisible();
}

async function goToInbox(page: Page) {
  await page.locator('button[title="Caixa de Entrada"]').click();
  await expect(page.getByText(/minhas filas/i)).toBeVisible();
}

async function selectTicket(page: Page, id: string) {
  await page.locator('button', { hasText: id }).first().click();
  await expect(page.getByText(`#${id}`).first()).toBeVisible();
}

async function expectCurrentStatus(page: Page, status: string) {
  await expect(page.locator('label:has-text("Status Atual") + div span')).toHaveText(status);
}

test('triage flow: new -> waiting tech opinion -> waiting solution approval', async ({ page }) => {
  await loginAsManager(page);
  await goToInbox(page);
  await selectTicket(page, 'OS-0050');

  await page.locator('textarea').fill('Solicitando parecer técnico para análise inicial.');
  await page.getByRole('button', { name: /avançar: aguardando parecer/i }).click();
  await expectCurrentStatus(page, 'Aguardando Parecer Técnico');

  await page.locator('textarea').fill('Parecer técnico concluído: seguir com aprovação da solução.');
  await page.getByRole('button', { name: /enviar para aprovação/i }).click();
  await expectCurrentStatus(page, 'Aguardando Aprovação da Solução');
});

test('director flow: solution approval -> waiting budget', async ({ page }) => {
  await loginAsManager(page);
  await page.locator('button[title="Painel da Diretoria"]').click();
  await expect(page.getByRole('heading', { name: /painel da diretoria/i })).toBeVisible();

  await page.getByRole('button', { name: /soluções/i }).click();
  const solutionCard = page.locator('div').filter({ hasText: 'OS-0048' }).first();
  await solutionCard.getByRole('button', { name: /aprovar \(ir para cotação\)/i }).click();

  await goToInbox(page);
  await selectTicket(page, 'OS-0048');
  await expectCurrentStatus(page, 'Aguardando Orçamento');
});

test('budget flow in inbox: waiting budget -> waiting budget approval', async ({ page }) => {
  await loginAsManager(page);
  await goToInbox(page);
  await selectTicket(page, 'OS-0047');

  await page.getByRole('button', { name: /gerenciar cotações/i }).click();
  await page.getByPlaceholder('Nome da Empresa').nth(0).fill('Fornecedor A');
  await page.getByPlaceholder('R$ 0,00').nth(0).fill('R$ 1.000,00');
  await page.getByPlaceholder('Nome da Empresa').nth(1).fill('Fornecedor B');
  await page.getByPlaceholder('R$ 0,00').nth(1).fill('R$ 1.200,00');
  await page.getByPlaceholder('Nome da Empresa').nth(2).fill('Fornecedor C');
  await page.getByPlaceholder('R$ 0,00').nth(2).fill('R$ 1.300,00');
  await page.getByRole('button', { name: /enviar para diretoria/i }).click();

  await expect(page.getByText(/orçamentos enviados para a diretoria com sucesso/i)).toBeVisible();
  await expectCurrentStatus(page, 'Aguardando Aprovação do Orçamento');
});

test('contract flow: waiting budget approval -> waiting prelim actions', async ({ page }) => {
  await loginAsManager(page);
  await page.locator('button[title="Painel da Diretoria"]').click();
  await page.getByRole('button', { name: /orçamentos/i }).click();

  const budgetCard = page.locator('div').filter({ hasText: 'OS-0046' }).first();
  await budgetCard.getByRole('button', { name: /aprovar esta opção/i }).first().click();

  await page.getByRole('button', { name: /contratos/i }).click();
  const contractCard = page.locator('div.bg-roman-parchment').filter({ hasText: 'OS-0046' });
  await contractCard.getByRole('button', { name: /assinar contrato/i }).click();

  await page.locator('input[type="file"][accept=".pdf"]').setInputFiles({
    name: 'contrato-assinado.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%fake-pdf\n'),
  });
  await page.getByRole('button', { name: /confirmar e enviar/i }).click();

  await goToInbox(page);
  await selectTicket(page, 'OS-0046');
  await expectCurrentStatus(page, 'Aguardando Ações Preliminares');
});

test('execution flow: prelim actions -> in progress -> waiting maintenance approval', async ({ page }) => {
  await loginAsManager(page);
  await goToInbox(page);
  await selectTicket(page, 'OS-0044');

  await page.getByRole('button', { name: /ações preliminares \(compras\)/i }).click();
  await page.getByRole('button', { name: /materiais solicitados/i }).click();
  await page.getByRole('button', { name: /disponibilidade da equipe confirmada/i }).click();
  await page.getByRole('button', { name: /cronograma de execução definido/i }).click();
  await page.getByRole('button', { name: /acesso ao local liberado/i }).click();
  await page.getByRole('button', { name: /concluir e iniciar execução/i }).click();
  await expectCurrentStatus(page, 'Em andamento');

  await page.getByRole('button', { name: /enviar para validação/i }).click();
  await expectCurrentStatus(page, 'Aguardando aprovação da manutenção');
});

test('tracking approval flow: waiting maintenance approval -> waiting payment', async ({ page }) => {
  await loginAsManager(page);
  await goToInbox(page);
  await selectTicket(page, 'OS-0042');

  await page.locator('button[title="Visualizar como solicitante"]').click();
  await expect(page.getByRole('heading', { name: /acompanhamento de os/i })).toBeVisible();
  await page.getByRole('button', { name: /serviço aprovado/i }).click();
  await page.getByRole('button', { name: /voltar ao sistema interno/i }).click();

  await expectCurrentStatus(page, 'Aguardando pagamento');
});

test('finance payment flow: waiting payment -> closed', async ({ page }) => {
  await loginAsManager(page);
  await page.locator('button[title="Financeiro"]').click();
  await expect(page.getByRole('heading', { name: /painel financeiro/i })).toBeVisible();

  const paymentCard = page.locator('div').filter({ hasText: 'OS-0041' }).first();
  await paymentCard.getByRole('button', { name: /confirmar pagamento/i }).click();
  await expect(page.getByText(/pagamento confirmado\. os os-0041 encerrada com sucesso/i)).toBeVisible();

  await goToInbox(page);
  await selectTicket(page, 'OS-0041');
  await expectCurrentStatus(page, 'Encerrada');
});
