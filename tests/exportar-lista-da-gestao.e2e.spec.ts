import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';
import { ehPdf, textoDoPdf } from './pdfTexto';

const managerEmail = process.env.E2E_MANAGER_EMAIL || 'gestor.e2e@test.local';
const adminEmail = process.env.E2E_LOGIN_EMAIL || 'admin@test.local';
const password = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

/**
 * A FILA FILTRADA EM PDF, PELA TELA DE GESTÃO.
 *
 * ⚠️ ESTE TESTE ABRE O ARQUIVO, pelo mesmo motivo do irmão dele (`exportar-pdf-da-os`):
 * conferir que o download disparou, ou que o corpo veio com `application/pdf`, afirma
 * sobre o TRANSPORTE — e o defeito desta família é o transporte funcionando com o
 * conteúdo vazio. PDF em branco baixa igual a PDF certo.
 *
 * ⚠️ E CONFERE O RECORTE, não só as linhas. O risco deste documento não é sair
 * errado, é sair certo e ser LIDO errado: "3 OS" num e-mail se lê como "existem 3
 * OS". Se o cabeçalho perder os filtros, a tabela continua correta e o papel passa a
 * mentir — por isso o filtro é asserção, e não detalhe de layout.
 */
test.describe('exportar a lista da Gestão em PDF', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * ⚠️ O ALERTA DE ERRO PRECISA APARECER NA FALHA DO TESTE.
   *
   * A tela avisa o erro com `window.alert`, e o Playwright dispensa diálogo sozinho:
   * sem isto, um erro do servidor vira "esperei 30s por um download" — a mensagem
   * que explicava tudo é descartada antes de alguém ler. Falha muda tem que sair.
   */
  async function baixarLista(page: import('@playwright/test').Page) {
    let alerta = '';
    page.on('dialog', async d => {
      alerta = d.message();
      await d.dismiss();
    });
    const botao = page.getByRole('button', { name: /lista em pdf/i });
    await expect(botao).toBeEnabled();

    // A resposta ANTES do download, e separadas de propósito: se as duas esperas
    // fossem uma só, "o servidor recusou" e "o arquivo não desceu" dariam a mesma
    // falha — trinta segundos de silêncio — e seriam investigadas como a mesma coisa.
    const resposta = page.waitForResponse(r => r.url().includes('route=lista-pdf'));
    const baixando = page.waitForEvent('download');
    await botao.click();

    const r = await resposta.catch(() => null);
    if (!r) throw new Error(alerta ? `a tela recusou: ${alerta}` : 'a tela não chegou a pedir o PDF');
    expect(r.status(), alerta || 'resposta do servidor').toBe(200);

    const download = await baixando.catch(() => {
      throw new Error(`o servidor respondeu ${r.status()}, mas nada foi baixado${alerta ? ` — ${alerta}` : ''}`);
    });
    return { download, pdf: readFileSync((await download.path())!) };
  }

  test('o arquivo traz as OS do recorte e diz de que recorte saiu', async ({ page }) => {
    await loginWithPassword(page, adminEmail, password);
    await page.goto('/?view=os-board');

    // Um filtro de verdade, como o da operação: uma sede.
    const sede = page.locator('select').first();
    await sede.selectOption('SUL3');
    const linhas = page.locator('table tbody tr');
    await expect.poll(() => linhas.count()).toBeGreaterThan(0);
    const esperadas = await linhas.count();

    const { download, pdf } = await baixarLista(page);
    expect(download.suggestedFilename()).toBe('gestao-de-os.pdf');
    expect(ehPdf(pdf)).toBe(true);

    const texto = textoDoPdf(pdf);
    expect(texto).toContain('Gestão de OS');
    // O RECORTE, escrito no papel — o que impede a leitura falsa.
    expect(texto).toContain('Sede: SUL3');
    expect(texto).toContain('Sem encerradas e canceladas');
    expect(texto).toContain(`${esperadas} de`);

    // E as OS que estão na tela, uma a uma — contagem certa com linha errada
    // continuaria passando se o teste olhasse só o número.
    // ⚠️ `td:first-child`, e nao `locator('td').first()`: o segundo pega a primeira
    // celula da TABELA inteira, e o laco conferia uma OS achando que conferia todas.
    const ids = await linhas.locator('td:first-child').allInnerTexts();
    // ⚠️ Sem esta linha o laço abaixo é VÁCUO: lista vazia não itera, e um teste que
    // não roda nenhuma asserção passa. Já custou 28 verdes falsos neste projeto.
    expect(ids.length).toBe(esperadas);
    for (const id of ids) {
      expect(texto).toContain(id.trim());
    }
  });

  test('as OS de fora do recorte NÃO entram no arquivo', async ({ page }) => {
    await loginWithPassword(page, adminEmail, password);
    await page.goto('/?view=os-board');

    // Sem filtro, guarda uma OS de outra sede para cobrar a ausência dela depois.
    const forasteira = (await page.locator('table tbody tr').filter({ hasText: 'PQL3' })
      .first().locator('td:first-child').innerText()).trim();

    await page.locator('select').first().selectOption('SUL3');
    await expect.poll(() => page.locator('table tbody tr').count()).toBeGreaterThan(0);

    const { pdf } = await baixarLista(page);
    expect(textoDoPdf(pdf)).not.toContain(forasteira);
  });

  test('o Gestor exporta o que ele enxerga', async ({ page }) => {
    // O portão de território é do SERVIDOR: as linhas vêm do cliente, mas quais podem
    // sair no papel é decisão de `handleListaPdf`. Sem isto, bastaria forjar o corpo
    // do POST para imprimir a fila de outra sede.
    await loginWithPassword(page, managerEmail, password);
    await page.goto('/?view=os-board');
    await expect.poll(() => page.locator('table tbody tr').count()).toBeGreaterThan(0);

    const { pdf } = await baixarLista(page);
    expect(ehPdf(pdf)).toBe(true);
    expect(textoDoPdf(pdf)).toContain('Gestão de OS');
  });
});
