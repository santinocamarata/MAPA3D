import { defineConfig, loadEnv } from 'vite';

import { aiProxyPlugin } from './server/aiProxy.js';

export default defineConfig(({ mode }) => {
  // Se cargan TODAS las variables (prefijo '') porque ANTHROPIC_API_KEY se usa
  // sólo del lado del servidor y no debe llevar el prefijo VITE_ (eso la
  // inyectaría en el bundle del cliente).
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [aiProxyPlugin(env)],
    server: { port: 5173, open: false },
    build: { outDir: 'dist' },
  };
});
