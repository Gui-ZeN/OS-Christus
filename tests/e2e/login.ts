import { expect, type Page } from '@playwright/test';

export async function loginWithPassword(
  page: Page,
  email: string | undefined,
  password: string | undefined
) {
  if (!email || !password) {
    throw new Error('Credenciais E2E não configuradas.');
  }

  // O modal "Novidades do sistema" abre uma vez por versão para Admin/Gestor e, como
  // cada teste roda em contexto limpo, ele aparecia SEMPRE — o overlay intercepta os
  // cliques e derrubava o spec do ciclo financeiro. Marca como visto para qualquer
  // versão (sem fixar o número, senão o teste quebra ao publicar novas notas).
  await page.addInitScript(() => {
    const PREFIX = 'os-christus-release-seen:';
    const storage = window.localStorage;
    const originalGetItem = storage.getItem.bind(storage);
    storage.getItem = (key: string) => (key.startsWith(PREFIX) ? '1' : originalGetItem(key));
  });

  await page.goto('/');
  await page.getByRole('button', { name: /acesso à gestão/i }).click();
  await page.getByLabel('E-mail institucional').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: /acessar o sistema/i }).click();
  // O sinal de "entrou" é a BARRA LATERAL, não o conteúdo de uma tela específica.
  //
  // Antes esperava o cabeçalho "Olá," — que é do Início. Quando quem opera passou a
  // cair direto no Hoje (13/08), esse heading deixou de existir para Admin/Gestor e
  // CINCO specs quebraram de uma vez, todos por esta linha. Amarrar o login à tela de
  // destino faz o helper reprovar sempre que a porta de entrada mudar, que é decisão
  // de produto e não regressão.
  //
  // Timeout maior que o global (5s): este é o primeiro render pós-login e no CI ele
  // paga o cold start (bundle + Auth do emulador). Com 5s o spec de escopo de acesso
  // ficava flaky justamente por ser o primeiro a rodar.
  await expect(page.getByTitle('Sair', { exact: true })).toBeVisible({ timeout: 20000 });
}
