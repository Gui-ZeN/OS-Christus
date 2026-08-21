import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function normalizePath(id: string) {
  return id.replace(/\\/g, '/');
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = normalizePath(id);

            if (!normalizedId.includes('/node_modules/')) return undefined;
            if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/') || normalizedId.includes('/scheduler/')) return 'react-core';
            if (normalizedId.includes('/firebase/') || normalizedId.includes('/@firebase/')) return 'firebase';
            if (normalizedId.includes('/recharts/')) return 'charts';
            if (normalizedId.includes('/date-fns/')) return 'date-fns';
            if (normalizedId.includes('/lucide-react/')) return 'icons';
            if (normalizedId.includes('/@babel/')) return 'babel-runtime';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Dev local: encaminha /api para o adaptador de funções serverless.
      proxy: env.VITE_API_PROXY
        ? {
            '/api': {
              target: env.VITE_API_PROXY,
              changeOrigin: true,
              /**
               * ⚠️ `api/_lib/` é código COMPARTILHADO, não rota.
               *
               * Nove módulos de `api/_lib/` são importados por `src/` — moeda, etapas,
               * estado da OS, cobrança, modelos de e-mail. No build isso some, porque o
               * bundler resolve tudo em disco. Mas no `vite dev` cada módulo é buscado
               * por URL, e `/api/_lib/currency.js` caia no proxy: o adaptador lia
               * `_lib` como nome de rota, tentava importar `api/_lib.js`, e respondia
               * 500. O app NÃO MONTAVA — tela branca, sem erro que explicasse.
               *
               * Ficou escondido porque o E2E roda contra o build (`vite preview`), onde
               * esses imports já estão empacotados. Quem rodava `npm run dev` com o
               * proxy ligado via a tela branca e não tinha como saber por quê.
               *
               * `bypass` devolvendo a URL faz o próprio vite servir o arquivo do disco,
               * em vez de encaminhar.
               */
              bypass: (req: { url?: string }) =>
                req.url?.startsWith('/api/_lib/') ? req.url : undefined,
            },
          }
        : undefined,
    },
  };
});
