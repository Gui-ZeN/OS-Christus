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
            if (normalizedId.includes('/motion/')) return 'motion';
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
    },
  };
});
