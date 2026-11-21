import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Destino del proxy de /api en desarrollo (valor por defecto). */
export const DEFAULT_API_PROXY_TARGET = 'http://localhost:3000';

/**
 * Destino del proxy de /api. Lee MEDSUPPLY_API_PROXY_TARGET (sin prefijo VITE_: solo la ve
 * el servidor de desarrollo y nunca llega al bundle). Los E2E la usan para apuntar al backend en 3100 (TK-00.5, D-7).
 */
export function resolveApiProxyTarget(env: Record<string, string | undefined>): string {
  return env.MEDSUPPLY_API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET;
}

// Las variables de entorno (VITE_*) se leen del .env de la raíz del repositorio (TK-00.2).
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(import.meta.dirname, '..'),
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': resolveApiProxyTarget(process.env),
    },
  },
});
