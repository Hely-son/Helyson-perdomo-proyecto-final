// Runner E2E (TK-00.5, D-5..D-8, A13). Levanta backend (3100) y frontend (5174) y usa medsupply_test,
// que prepara `npm run test:db` antes (en serie, nunca en paralelo). No recrea ni migra PostgreSQL.
// TK-01.2 (D2, D3, D6): secreto JWT y contraseña del operador E2E aleatorios por ejecución; el operador
// E2E se prepara una vez en e2e/global-setup.ts. Ningún valor se imprime, persiste ni pasa por la línea de comandos.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from '@playwright/test';

const HOST = '127.0.0.1';
const BACKEND_PORT = 3100;
const FRONTEND_PORT = 5174;
const BACKEND_URL = `http://${HOST}:${BACKEND_PORT}`;
const FRONTEND_URL = `http://${HOST}:${FRONTEND_PORT}`;

// Se generan una vez, en el proceso principal: los workers vuelven a evaluar este archivo, pero heredan
// su entorno, así que `??=` conserva el mismo valor en todos. No se reutiliza el JWT_SECRET de desarrollo.
const E2E_JWT_SECRET = (process.env.MEDSUPPLY_E2E_JWT_SECRET ??= randomBytes(48).toString('base64url'));
process.env.MEDSUPPLY_E2E_OPERATOR_PASSWORD ??= randomBytes(24).toString('base64url');

/** Deriva la URL de medsupply_test desde DATABASE_URL (entorno o .env de la raíz), sin imprimirla nunca. */
export function resolveTestDatabaseUrl(): string {
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
  globalSetup: './e2e/global-setup.ts',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  use: { baseURL: FRONTEND_URL },
  webServer: [
    {
      // Build + start, sin watcher (A13). Las variables van en `env`, no en el comando (aparece en ps y en errores).
      // JWT_SECRET es el temporal de E2E: el entorno del proceso tiene prioridad sobre --env-file-if-exists=../.env
      // (lo comprueba e2e/jwt-secret-isolation.spec.ts).
      command: 'npm run build && node --env-file-if-exists=../.env dist/server.js',
      cwd: '../backend',
      env: {
        PORT: String(BACKEND_PORT),
        DATABASE_URL: resolveTestDatabaseUrl(),
        JWT_SECRET: E2E_JWT_SECRET,
        // TK-05.5 (D1): plazo de inactividad del chat de 1 minuto solo para E2E (CA-16, CH-11). El entorno del proceso tiene
        // prioridad sobre --env-file-if-exists=../.env. e2e/chat-purchase.spec.ts (CA-16) falla si el backend conserva 30 minutos.
        CHAT_SESSION_TTL_MINUTES: '1',
      },
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
