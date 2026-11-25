import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { test, expect } from '@playwright/test';
import { BACKEND_URL, E2E_OPERATOR_EMAIL, e2eJwtSecret, e2eOperatorPassword } from './support/e2e-env';

// QA-01.2-27 (TK-01.2, D3; RNF-08): el backend de E2E firma con el JWT_SECRET temporal de la ejecución, que
// comparte con Playwright, y no con el de desarrollo del .env. También es la prueba de humo de la infraestructura:
// backend arriba, operador E2E preparado y login por la API con 200.
// Ningún secreto ni token se imprime: las aserciones comparan booleanos.

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}

function verifiesWith(token: string, secret: string): boolean {
  const [head, body, signature] = token.split('.');
  return createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url') === signature;
}

function developmentJwtSecret(): string | undefined {
  const envFile = path.resolve(import.meta.dirname, '..', '..', '.env');
  if (!existsSync(envFile)) return undefined;
  return parseEnv(readFileSync(envFile, 'utf8')).JWT_SECRET || undefined;
}

test.describe('QA-01.2-27 (D3): JWT_SECRET temporal de E2E compartido por backend y Playwright', () => {
  test('el secreto de E2E tiene al menos 32 bytes', () => {
    expect(Buffer.byteLength(e2eJwtSecret(), 'utf8') >= 32).toBe(true);
  });

  test('login del operador E2E por la API → 200 y token firmado con el secreto de E2E, aceptado por el backend', async ({
    request,
  }) => {
    const response = await request.post(`${BACKEND_URL}/api/v1/auth/login`, {
      data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() },
    });
    expect(response.status(), 'login del operador E2E').toBe(200);
    const { token } = (await response.json()) as { token: string };
    expect(verifiesWith(token, e2eJwtSecret()), 'el token se verifica con el secreto de E2E').toBe(true);

    const products = await request.get(`${BACKEND_URL}/api/v1/products`, { headers: { Authorization: `Bearer ${token}` } });
    expect(products.status(), 'el token de login atraviesa el middleware').not.toBe(401);
  });

  test('un token firmado con el JWT_SECRET del .env es rechazado: el entorno tiene prioridad sobre --env-file', async ({
    request,
  }) => {
    const devSecret = developmentJwtSecret();
    test.skip(devSecret === undefined, 'No hay .env con JWT_SECRET: no hay secreto de desarrollo que aislar');
    const secret = devSecret as string;
    expect(secret === e2eJwtSecret(), 'el secreto de E2E es distinto del de desarrollo').toBe(false);

    const iat = Math.floor(Date.now() / 1000);
    const forged = signHs256({ sub: '1', iat, exp: iat + 3600 }, secret);
    const response = await request.get(`${BACKEND_URL}/api/v1/products`, { headers: { Authorization: `Bearer ${forged}` } });
    expect(response.status()).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');

    const login = await request.post(`${BACKEND_URL}/api/v1/auth/login`, {
      data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() },
    });
    const { token } = (await login.json()) as { token: string };
    expect(verifiesWith(token, secret), 'el token de login no se verifica con el secreto de desarrollo').toBe(false);
  });
});
