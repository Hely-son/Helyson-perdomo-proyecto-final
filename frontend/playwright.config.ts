// Runner E2E (TK-00.5, D-5..D-8, A13). Levanta backend (3100) y frontend (5174) y usa medsupply_test,
// que prepara `npm run test:db` antes (en serie, nunca en paralelo). No recrea ni migra PostgreSQL.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from '@playwright/test';

const HOST = '127.0.0.1';
const BACKEND_PORT = 3100;
const FRONTEND_PORT = 5174;
const BACKEND_URL = `http://${HOST}:${BACKEND_PORT}`;
const FRONTEND_URL = `http://${HOST}:${FRONTEND_PORT}`;

/** Deriva la URL de medsupply_test desde DATABASE_URL (entorno o .env de la raíz), sin imprimirla nunca. */
function resolveTestDatabaseUrl(): string {
  let raw = process.env.DATABASE_URL;
  if (!raw) {
    const envFile = path.resolve(import.meta.dirname, '..', '.env');
    if (existsSync(envFile)) raw = parseEnv(readFileSync(envFile, 'utf8')).DATABASE_URL;
  }
  try {
    const url = new URL(raw ?? '');
    url.pathname = '/medsupply_test';
    if (decodeURIComponent(url.pathname.slice(1)) !== 'medsupply_test') throw new Error('destino');
    return url.toString();
  } catch {
    throw new Error('playwright.config: DATABASE_URL ausente o inválida');
  }
}

export default defineConfig({
  testDir: './e2e',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  use: { baseURL: FRONTEND_URL },
  webServer: [
    {
      // Build + start, sin watcher (A13). JWT_SECRET llega del .env por --env-file-if-exists (H3).
      // Las variables van en `env`, no en el comando (aparece en ps y en errores).
      command: 'npm run build && node --env-file-if-exists=../.env dist/server.js',
      cwd: '../backend',
      env: { PORT: String(BACKEND_PORT), DATABASE_URL: resolveTestDatabaseUrl() },
      url: `${BACKEND_URL}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node_modules/.bin/vite --host ${HOST} --port ${FRONTEND_PORT} --strictPort`,
      env: { MEDSUPPLY_API_PROXY_TARGET: BACKEND_URL },
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
