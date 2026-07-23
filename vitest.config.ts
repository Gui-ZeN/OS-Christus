import { defineConfig } from 'vitest/config';

// Testes unitários dos módulos PUROS (backend api/*.js e utils do front). Ambiente
// node — não sobe browser nem emulador. E2E do Playwright fica em tests/*.e2e.spec.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{js,ts}'],
    globals: false,
  },
});
