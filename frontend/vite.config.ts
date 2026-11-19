import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Las variables de entorno (VITE_*) se leen del .env de la raíz del repositorio (TK-00.2).
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(import.meta.dirname, '..'),
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
