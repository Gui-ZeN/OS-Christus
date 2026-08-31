import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loginWithPassword } from './e2e/login';
import {
  LIFECYCLE_TICKET_IDS,
  NOTA_INTERNA_DA_CONVERSA,
  NOTA_PUBLICA_DA_CONVERSA,
  resetLifecycleFixtures,
} from './e2e/lifecycle-state';
import { ehPdf, textoDoPdf } from './pdfTexto';

const managerEmail = process.env.E2E_MANAGER_EMAIL || 'gestor.e2e@test.local';
const password = process.env.E2E_LOGIN_PASSWORD || 'Test@123456';

/**
 * O RETRATO DA OS EM PDF, PELA TELA DE GESTÃO.
 *
 * ⚠️ ESTE TESTE ABRE O ARQUIVO. Conferir que o download disparou — ou que o corpo
 * tem `Content-Type: application/pdf` — afirma sobre o transporte, e o defeito desta
 * família é justamente o transporte funcionando com o conteúdo vazio: "botão que
 * descarta o resultado", "job verde que não entrega". Um PDF em branco baixa igual a
 * um PDF certo.
 *
 * A ausência do E2E no seletor de etapa da Inbox deixou três defeitos chegarem à
 * operação de uma vez. Esta ação nasce com o teste junto.
 */
test.describe('exportar o estado da OS em PDF', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async () => {
    await resetLifecycleFixtures();
  });

  /** Baixa o PDF da OS pela linha da tabela e devolve o arquivo já lido. */
  async function baixarPdfDaLinha(page: import('@playwright/test').Page, ticketId: string) {
    await page.goto('/?view=os-board');
    await page.getByPlaceholder(/buscar os/i).fill(ticketId);
    // `tbody tr` e não `getByRole('row')`: a linha inteira é clicável e leva
    // `role="button"`, que substitui o papel implícito de linha.
    const linha = page.locator('table tbody tr').filter({ hasText: ticketId });
    await expect(linha).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      linha.getByRole('button', { name: /estado em pdf/i }).click(),
    ]);
    const caminho = await download.path();
    return { download, pdf: readFileSync(caminho) };
  }

  test('o arquivo baixado abre e mostra o estado atual da OS', async ({ page }) => {
    await loginWithPassword(page, managerEmail, password);
    const { download, pdf } = await baixarPdfDaLinha(page, LIFECYCLE_TICKET_IDS.parecer);

    expect(download.suggestedFilename()).toBe(`${LIFECYCLE_TICKET_IDS.parecer}-estado.pdf`);
    expect(pdf.length).toBeGreaterThan(0);
    expect(ehPdf(pdf)).toBe(true);

    const texto = textoDoPdf(pdf);
    // Identificação, etapa e classificação — o que o bilhete pediu, conferido no
    // conteúdo do arquivo e não na tela que o gerou.
    expect(texto).toContain(LIFECYCLE_TICKET_IDS.parecer);
    expect(texto).toContain('Fixture E2E - parecer tecnico com diretor');
    expect(texto).toContain('Em análise');
    expect(texto).toContain('PQL3');
    expect(texto).toContain('Estrutura Civil');
    expect(texto).toContain('Reforma');
    expect(texto).toContain('Linha do tempo');
    expect(texto).toContain(NOTA_PUBLICA_DA_CONVERSA);
  });

  /**
   * A PROVA DO CORTE. O Gestor VÊ a nota interna na tela — ele a escreveu. O que não
   * pode é ela sair num arquivo que será encaminhado por e-mail e impresso.
   */
  test('a nota interna não sai no arquivo, e o corte é declarado nele', async ({ page }) => {
    await loginWithPassword(page, managerEmail, password);
    const { pdf } = await baixarPdfDaLinha(page, LIFECYCLE_TICKET_IDS.parecer);

    const texto = textoDoPdf(pdf);
    expect(texto).not.toContain(NOTA_INTERNA_DA_CONVERSA);
    expect(texto).not.toContain('NOTA INTERNA');
    // Corte calado se lê como ausência: o papel diz que houve corte, e conta.
    expect(texto).toContain('não entram neste documento');
    expect(texto).toContain('Sem dados financeiros e sem registro interno');
  });
});
