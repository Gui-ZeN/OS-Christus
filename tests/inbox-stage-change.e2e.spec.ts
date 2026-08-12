import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';
import { LIFECYCLE_TICKET_IDS, readTicketState, resetLifecycleFixtures } from './e2e/lifecycle-state';

const managerEmail = process.env.E2E_MANAGER_EMAIL || 'gestor.e2e@test.local';
const password = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

/**
 * TROCA DE ETAPA PELA INBOX — a lacuna que deixou três defeitos chegarem à operação.
 *
 * Em 12/08 chegaram dois relatos ("não está atualizando o status", "se foi concluída
 * não deixa alterar") e por trás deles havia TRÊS causas diferentes. Nenhuma foi
 * pega por teste: o spec de ciclo crítico exercita o encerramento pelo FINANCEIRO, e
 * o seletor da Inbox — por onde a operação realmente mexe — não tinha cobertura
 * nenhuma. Os três chegaram em produção e voltaram como captura de tela.
 *
 * Cada teste aqui reproduz um deles. Se algum voltar, cai aqui e não na mesa do
 * Thiers.
 */
test.describe('troca de etapa pela Inbox', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await resetLifecycleFixtures();
    // Nenhum e-mail sai daqui: o teste é sobre a ETAPA. Sem isto, cada transição
    // voltada para fora tentaria o Gmail de verdade e o spec ficaria dependente de
    // credencial que o CI não tem.
    await page.route(
      url => url.pathname === '/api/mail' && url.searchParams.get('route') === 'send',
      route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    );
  });

  /** Abre a OS na Inbox e revela o seletor de etapa (fica atrás de "Alterar etapa"). */
  async function abrirSeletorDeEtapa(page: import('@playwright/test').Page, ticketId: string) {
    await page.goto(`/?view=inbox`);
    const item = page.getByRole('button', { name: new RegExp(ticketId, 'i') }).first();
    // A lista esconde encerradas e canceladas por padrão. Sem revelar, a OS que o
    // teste precisa simplesmente não existe na tela — e o erro sai como "não achei o
    // botão", que não explica nada.
    if (!(await item.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /mostrar encerradas/i }).click();
    }
    await item.click();
    await expect(page.getByText(ticketId, { exact: false }).first()).toBeVisible();
    const alterar = page.getByRole('button', { name: /alterar etapa/i });
    if (await alterar.isVisible().catch(() => false)) await alterar.click();
  }

  async function escolherEtapa(page: import('@playwright/test').Page, etapa: string, motivo: string) {
    await page.getByLabel('Nova etapa da OS').selectOption(etapa);
    await page.getByPlaceholder(/motivo da transição/i).fill(motivo);
    await page.getByRole('button', { name: new RegExp(`Salvar e mover para`, 'i') }).click();
  }

  // DEFEITO 1: com diretor selecionado, o parecer ia para "Aguardando Aprovação da
  // Solução" — etapa aposentada, que o servidor recusa com 409. A OS não saía do
  // lugar e a tela não dizia por quê.
  test('parecer técnico com diretor vai para orçamento, não para a etapa aposentada', async ({ page }) => {
    await loginWithPassword(page, managerEmail, password);
    await page.goto('/?view=inbox');
    await page.getByRole('button', { name: new RegExp(LIFECYCLE_TICKET_IDS.parecer, 'i') }).first().click();

    await page.getByRole('button', { name: /liberar para orçamento/i }).click();

    await expect
      .poll(async () => (await readTicketState(LIFECYCLE_TICKET_IDS.parecer))?.status, { timeout: 15000 })
      .toBe('Aguardando Orçamento');
  });

  // DEFEITO 2: o seletor vinha `disabled` em OS encerrada, embora o código montasse
  // as opções de reabertura. Encerrar por engano é comum; ficar preso no engano não
  // pode ser o preço.
  test('OS encerrada por engano pode ser reaberta', async ({ page }) => {
    await loginWithPassword(page, managerEmail, password);
    await abrirSeletorDeEtapa(page, LIFECYCLE_TICKET_IDS.encerrada);

    await escolherEtapa(page, 'Em andamento', 'Reabertura: encerrada por engano.');
    await page.getByRole('button', { name: /alterar sem avisar/i }).click();

    await expect
      .poll(async () => (await readTicketState(LIFECYCLE_TICKET_IDS.encerrada))?.status, { timeout: 15000 })
      .toBe('Em andamento');
  });

  // DEFEITO 3: o diálogo se chama "Avisar o solicitante?" e o botão de abortar se
  // chamava "Cancelar" — lido como "cancelar o e-mail". Cancelava a troca INTEIRA, em
  // silêncio. Duas pessoas caíram nisso no mesmo dia.
  test('desistir avisa o que ficou, em vez de sair calado', async ({ page }) => {
    await loginWithPassword(page, managerEmail, password);
    await abrirSeletorDeEtapa(page, LIFECYCLE_TICKET_IDS.desistir);

    await escolherEtapa(page, 'Encerrada', 'Teste de desistência.');
    await page.getByRole('button', { name: /não alterar a etapa/i }).click();

    // O aviso é a metade que importa: sem ele, a pessoa conclui que o sistema quebrou.
    await expect(page.getByText(/nada foi alterado/i)).toBeVisible();
    expect((await readTicketState(LIFECYCLE_TICKET_IDS.desistir))?.status).toBe(
      'Aguardando Parecer Técnico'
    );
  });

  test('o caminho normal grava: encerrar sem avisar o solicitante', async ({ page }) => {
    await loginWithPassword(page, managerEmail, password);
    await abrirSeletorDeEtapa(page, LIFECYCLE_TICKET_IDS.desistir);

    await escolherEtapa(page, 'Encerrada', 'Serviço concluído e conferido.');
    await page.getByRole('button', { name: /alterar sem avisar/i }).click();

    await expect
      .poll(async () => (await readTicketState(LIFECYCLE_TICKET_IDS.desistir))?.status, { timeout: 15000 })
      .toBe('Encerrada');
  });
});
