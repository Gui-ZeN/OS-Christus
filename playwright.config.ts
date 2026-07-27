import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // O spec legado tem skip condicional e IDs fixos (OS-0050): fora do glob padrão
  // para não voltar por engano num `playwright test` sem argumentos. Ele continua
  // disponível pelo script dedicado `test:e2e:lifecycle-legacy`.
  testIgnore: ['lifecycle.e2e.spec.ts'],
  fullyParallel: !process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
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
