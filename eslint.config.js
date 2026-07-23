import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Config enxuto: foco em BUGS reais (variável/undefined, chaves duplicadas,
// código inalcançável), estilo relaxado. O `tsc --noEmit` (npm run lint) segue
// sendo o gate de tipos; este é o gate de bugs de lógica.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Backend serverless (api/*.js), scripts e testes — ambiente node.
    files: ['api/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.{js,ts}', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Frontend — ambiente browser.
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    rules: {
      // Ruído de estilo/migração desligado; mantém só o que aponta bug.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'eqeqeq': ['warn', 'smart'],
      // Inofensivos aqui (escapes redundantes num regex testado; \x00 intencional
      // no decode de MIME) — vira warn, não bloqueia.
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
    },
  },
);
