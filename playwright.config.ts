import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /**
   * SO os specs de E2E.
   *
   * Sem isto vale o glob padrao do Playwright, que casa tambem `.test.ts` -- ou
   * seja, os ~80 testes unitarios em `tests/unit`. Cada um importa `vitest`, e com
   * `workers: 1` todos carregam no MESMO processo: o segundo arquivo tenta redefinir
   * o simbolo de matchers do vitest e a execucao morre antes de rodar um unico teste
   * de tela.
   *
   *   TypeError: Cannot redefine property: Symbol($$jest-matchers-object)
   *
   * A convencao de nome ja existia; faltava o Playwright saber dela.
   */
  testMatch: '**/*.e2e.spec.ts',
  // O spec legado tem skip condicional e IDs fixos (OS-0050): fora do glob padrão
  // para não voltar por engano num `playwright test` sem argumentos. Ele continua
  // disponível pelo script dedicado `test:e2e:lifecycle-legacy`.
  testIgnore: ['lifecycle.e2e.spec.ts'],
  /**
   * SERIAL SEMPRE — no CI e aqui. Paralelo não é otimização, é ruído.
   *
   * A suíte inteira compartilha UM emulador, UM servidor e um banco: os specs
   * escrevem no mesmo lugar, e dois deles (`foco-visivel`, `alvo-de-clique`) medem
   * A TELA — onde o Tab para, que tamanho tem cada controle. Rodar em paralelo faz
   * cada um enxergar um estado diferente.
   *
   * Medido em 19/08, mesma máquina, mesma suíte:
   *   paralelo (como estava)  → 1, 2, 3 e 10 falhas em quatro rodadas
   *   serial                  → 20/20 em três rodadas, ~1,3 min cada
   *
   * O CI já era serial, então ele nunca sofreu disso. Quem sofria era quem roda
   * localmente: falha aleatória ensina a ignorar o vermelho, e foi assim que eu
   * publiquei um E2E quebrado hoje sem perceber. Um minuto a mais vale um sinal em
   * que dá para confiar.
   */
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
