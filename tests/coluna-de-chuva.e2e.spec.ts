import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';

/**
 * A COLUNA DE CHUVA NA GESTÃO — liga o mesmo `waterIssue` que a Caixa de Entrada já
 * marcava no painel rápido, só que de um clique, sem abrir a OS.
 *
 * ⚠️ O TESTE RECARREGA A PÁGINA antes de confirmar. Optimistic update mostra o ícone
 * mudado na hora mesmo se o PATCH falhar — só o reload prova que gravou no banco, e
 * não só na tela. É o mesmo princípio do teste do aviso de chuva do usuário
 * (`print-usuario-chuva.e2e.spec.ts`): campo que só muda na tela e não sobrevive ao
 * F5 é campo que não foi salvo.
 */
test.describe('coluna de chuva na Gestão', () => {
  test.describe.configure({ mode: 'serial' });

  async function botaoDaLinha(page: import('@playwright/test').Page, ticketId: string) {
    const linha = page.locator('table tbody tr').filter({ hasText: ticketId });
    await expect(linha).toHaveCount(1);
    return linha.getByRole('button', { name: /goteira/i });
  }

  test('marcar uma OS sem goteira: liga, sobrevive ao reload, e desliga de volta', async ({ page }) => {
    await loginWithPassword(page, 'admin@test.local', 'Test@123456');
    await page.goto('/?view=os-board');

    const botao = await botaoDaLinha(page, 'OS-0001');
    await expect(botao).toHaveAttribute('title', /marcar como risco/i);

    await botao.click();
    await expect(botao).toHaveAttribute('title', /marcada.*sai da lista/i);

    // A prova real: recarrega e confirma que gravou, não só que a tela mudou.
    await page.reload();
    const botaoDepois = await botaoDaLinha(page, 'OS-0001');
    await expect(botaoDepois).toHaveAttribute('title', /marcada.*sai da lista/i);

    // Desliga de volta — o teste não deixa rastro para a próxima execução.
    await botaoDepois.click();
    await expect(botaoDepois).toHaveAttribute('title', /marcar como risco/i);
    await page.reload();
    await expect(await botaoDaLinha(page, 'OS-0001')).toHaveAttribute('title', /marcar como risco/i);
  });

  test('OS-0008 já nasce marcada no seed — a tela reflete o que está no banco', async ({ page }) => {
    await loginWithPassword(page, 'admin@test.local', 'Test@123456');
    await page.goto('/?view=os-board');
    await expect(await botaoDaLinha(page, 'OS-0008')).toHaveAttribute('title', /marcada.*sai da lista/i);
  });

  /**
   * ⚠️ NÃO TESTA "usuário sem papel vê só o estado" — esse ramo existe no código
   * (mesma forma da coluna Responsável) mas é INALCANÇÁVEL: quem entra na Gestão já
   * satisfez `Admin || Gestor` no próprio App.tsx (`canAccessOsBoard`), a mesma
   * condição de `podeTrocarEtapa`. Não há papel que veja a tabela sem poder tocar o
   * botão. Testar esse ramo seria simular um estado que a aplicação não produz.
   *
   * O que É real: Admin e Gestor são dois papéis distintos com o mesmo acesso aqui,
   * e o servidor os trata igual (`OPERATIONAL_PATCH_FIELDS` em
   * `ticketPatchScope.js`) — vale confirmar que o Gestor, não só o Admin, consegue.
   */
  test('Gestor também consegue marcar — o servidor trata os dois papéis igual', async ({ page }) => {
    await loginWithPassword(page, process.env.E2E_MANAGER_EMAIL || 'gestor.e2e@test.local', 'Test@123456');
    await page.goto('/?view=os-board');

    // OS-0004: sede PQL3, dentro do território do Gestor E2E no seed. Uma fora do
    // território devolveria 0 linhas — não é falha de permissão, é escolha errada
    // de fixture, e a mensagem de erro do Playwright não distingue as duas.
    const botao = await botaoDaLinha(page, 'OS-0004');
    const eraMarcada = (await botao.getAttribute('title'))?.match(/marcada/i);
    await botao.click();
    await expect(botao).toHaveAttribute('title', eraMarcada ? /marcar como risco/i : /marcada.*sai da lista/i);

    // Devolve ao estado original — este teste não deve mudar dado para o próximo.
    await botao.click();
  });
});
