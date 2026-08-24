import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/**
 * A TELA NÃO PODE AFIRMAR O QUE AINDA NÃO SABE.
 *
 * Irmão do `ui-truthfulness`, que cobre o outro lado da mesma regra: lá, a interface
 * não pode declarar SUCESSO antes do servidor confirmar. Aqui, ela não pode declarar
 * AUSÊNCIA antes de ter carregado.
 *
 * As duas mentiras têm o mesmo formato e consequências opostas: uma faz a pessoa
 * achar que fez algo que não foi feito; a outra faz achar que não há trabalho
 * quando há. Nesta operação, "nenhuma OS" é uma frase cara — a gestora fecha a tela
 * e vai fazer outra coisa.
 *
 * Três estados que precisam ser DISTINGUÍVEIS entre si:
 *   · carregando  — ainda não sabemos
 *   · falhou      — não conseguimos saber, e aqui está a saída
 *   · vazio       — sabemos, e não há nada
 *
 * Antes deste teste, "carregando" e "vazio" eram a MESMA tela.
 */

const loginEmail = process.env.E2E_LOGIN_EMAIL || 'admin@test.local';
const loginPassword = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

/** A rota que alimenta as listas de OS — a que importa nos três estados. */
const ROTA_TICKETS = '**/api/tickets**';

test.describe('os três estados são distinguíveis', () => {
  test('CARREGANDO não pode parecer vazio', async ({ page }) => {
    /**
     * O defeito que este teste trava: a tela mostrava "Nenhuma OS carregada." desde
     * o primeiro instante, sem spinner, sem `role="status"`, sem `aria-busy` —
     * medido, era zero de cada. Numa sede com link ruim, a gestora via por segundos
     * uma tela idêntica a "não há trabalho".
     *
     * `ticketsLoading` já existia no contexto; as telas é que não consultavam.
     */
    await page.route(ROTA_TICKETS, async rota => {
      await new Promise(r => setTimeout(r, 6000));
      await rota.continue();
    });

    await loginWithPassword(page, loginEmail, loginPassword);
    await page.getByTitle('Gestão de OS', { exact: true }).click();

    /**
     * ⚠️ ESPERAR A VIEW MONTAR ANTES DE AFIRMAR — senão o teste é vácuo.
     *
     * São DOIS carregamentos em sequência, e só o segundo interessa:
     *   1. o app troca de tela e mostra um "Carregando..." global (chunk da view);
     *   2. a view monta com a lista VAZIA enquanto o fetch ainda está no ar.
     *
     * A mentira mora no passo 2. A primeira versão deste teste afirmava no passo 1 e
     * casava com o "Carregando..." global — passava com o conserto revertido.
     * Descoberto revertendo o conserto de propósito e vendo o verde continuar.
     *
     * A barra de filtros só existe depois que a view montou: é a âncora do passo 2.
     */
    const conteudo = page.locator('main');
    await expect(conteudo).toContainText('Sede:', { timeout: 15000 });

    await expect(
      conteudo,
      'a view montou com a lista vazia e o fetch ainda no ar: precisa dizer que está carregando'
    ).toContainText('Carregando as OS');
    await expect(
      conteudo,
      'enquanto carrega, a tela não pode afirmar que não há OS'
    ).not.toContainText('Nenhuma OS carregada');
  });

  test('FALHOU precisa aparecer, e com caminho de saída', async ({ page }) => {
    // Falha silenciosa é a pior das três: a tela fica igual a "não há nada", e a
    // pessoa não tem o que fazer a respeito porque nem sabe que houve problema.
    await page.route(ROTA_TICKETS, rota =>
      rota.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' })
    );

    await loginWithPassword(page, loginEmail, loginPassword);
    await page.getByTitle('Gestão de OS', { exact: true }).click();

    await expect(page.getByText(/não foi possível atualizar os tickets/i)).toBeVisible({
      timeout: 15000,
    });
    // O botão é o que separa "avisar" de "só reclamar": sem ele, a única saída da
    // pessoa é recarregar a página inteira e perder o que estava fazendo.
    await expect(page.getByRole('button', { name: /tentar novamente/i })).toBeVisible();
  });

  test('o vazio de falha diz "carregada", não "encontrada"', async ({ page }) => {
    /**
     * Uma palavra, e ela é a diferença entre verdade e mentira.
     *
     * "Nenhuma OS CARREGADA" fala do que o sistema conseguiu buscar. "Nenhuma OS
     * encontrada" afirmaria que não existem — e com a API fora, o sistema não sabe
     * disso. Alguém escolheu essa palavra com cuidado; sem teste, é o tipo de coisa
     * que a próxima passada de copy "melhora" para pior.
     */
    await page.route(ROTA_TICKETS, rota =>
      rota.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' })
    );

    await loginWithPassword(page, loginEmail, loginPassword);
    await page.getByTitle('Gestão de OS', { exact: true }).click();

    const conteudo = page.locator('main');
    await expect(conteudo).toContainText('Nenhuma OS carregada', { timeout: 15000 });
    await expect(conteudo).not.toContainText(/nenhuma OS encontrada/i);
    await expect(conteudo).not.toContainText(/não há OS/i);
  });
});

test('“Tentar novamente” recupera de verdade', async ({ page }) => {
  // Botão que não funciona é pior que botão ausente: a pessoa clica, nada muda, e
  // conclui que o sistema está quebrado de vez.
  let derrubar = true;
  await page.route(ROTA_TICKETS, async rota => {
    if (derrubar) {
      await rota.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
      return;
    }
    await rota.continue();
  });

  await loginWithPassword(page, loginEmail, loginPassword);
  await page.getByTitle('Gestão de OS', { exact: true }).click();

  const aviso = page.getByText(/não foi possível atualizar os tickets/i);
  await expect(aviso).toBeVisible({ timeout: 15000 });

  derrubar = false;
  await page.getByRole('button', { name: /tentar novamente/i }).click();

  await expect(aviso, 'com a API de volta, o aviso tem que sair').toBeHidden({ timeout: 15000 });
  await expect(page.locator('main')).not.toContainText('Nenhuma OS carregada');
});

test('⚠️ o contador ainda afirma “0 OS” sem saber', async ({ page }) => {
  /**
   * CARACTERIZAÇÃO de um comportamento que ficou, e é decisão sua.
   *
   * Com a API fora, o cabeçalho da Gestão exibe "0 OS". Não são zero — é que não
   * sabemos. O aviso ao lado salva a leitura de quem para para ler, mas número é
   * justamente o que se lê de relance, e "0" é uma afirmação.
   *
   * Mesma classe dos contadores de filtro ("Travadas (0)", "Água (0)").
   *
   * Não mexi porque é decisão de produto sobre o que mostrar no lugar — traço,
   * reticências, ou esconder o contador. Quando decidir, este teste falha de
   * propósito: é o lembrete.
   */
  await page.route(ROTA_TICKETS, rota =>
    rota.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' })
  );

  await loginWithPassword(page, loginEmail, loginPassword);
  await page.getByTitle('Gestão de OS', { exact: true }).click();

  await expect(page.getByText(/não foi possível atualizar os tickets/i)).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('main')).toContainText('0 OS');
});
