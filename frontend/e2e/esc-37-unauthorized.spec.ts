import { createHmac, randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  EXPIRED_NOTICE,
  emailField,
  openLoginForm,
  passwordField,
  readStoredSession,
  recordApiRequests,
  storeSession,
  submitButton,
} from './support/session';

// TK-01.3 · ESC-37 (E) · spec 05 §11.4, §15.6 (D-07), DP-05. Matriz: docs/qa/TK-01.3-matrix.md.
// Escenario:
//   G  un token guardado con `expiresAt` vigente que el backend rechaza por firma inválida
//   W  se abre /dashboard/products (la pantalla llama de verdad a listProducts al cargarse, TK-03.3)
//   T  la API responde 401 con code UNAUTHORIZED; el frontend descarta la sesión y queda en /login, una sola vez,
//      con el formulario visible y sin aviso de expiración (el aviso es solo para la expiración local, ESC-46).
// La firma inválida es determinista: el JWT se firma con un secreto aleatorio generado aquí. No se lee ni se firma
// con el JWT_SECRET de desarrollo ni con el de E2E, y ningún secreto ni token se imprime.

function b64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function signHs256(payload: Record<string, unknown>, secret: Buffer): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
}

test('QA-01.3-01 ESC-37 (E, CA-11): token vigente con firma inválida → UNAUTHORIZED real → /login, sesión eliminada, sin aviso de expiración', async ({
  page,
}) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const forgedToken = signHs256({ sub: '1', iat: nowSeconds, exp: nowSeconds + 3600 }, randomBytes(32));
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  // G: la página está en el origen de la app antes de escribir en localStorage.
  await openLoginForm(page);
  await storeSession(page, { token: forgedToken, expiresAt, operatorName: 'Operadora QA ESC-37' });
  const stored = JSON.parse((await readStoredSession(page)) ?? 'null') as { expiresAt: string } | null;
  expect(stored, 'la sesión quedó guardada').not.toBeNull();
  expect(Date.parse((stored as { expiresAt: string }).expiresAt) > Date.now(), 'afirmación 1: expiresAt vigente').toBe(true);

  const api = recordApiRequests(page);
  const visited: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });
  const productsRequest = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/api/v1/products' && r.method() === 'GET',
  );
  const productsResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/v1/products' && r.request().method() === 'GET',
  );

  // W
  await page.goto('/dashboard/products');

  // T: petición real y respuesta 401 UNAUTHORIZED del backend (afirmaciones 2 y 3).
  const request = await productsRequest;
  expect(request.headers().authorization, 'la petición lleva el token guardado').toBe(`Bearer ${forgedToken}`);
  const response = await productsResponse;
  expect(response.status(), 'afirmación 3: status de GET /api/v1/products').toBe(401);
  const body = (await response.json()) as { error?: { code?: string } };
  expect(body.error?.code, 'afirmación 3: code').toBe('UNAUTHORIZED');

  // Afirmación 4: /login estable, formulario visible, sin bucle.
  await expect(page).toHaveURL(/\/login$/);
  await expect(emailField(page)).toBeVisible();
  await expect(passwordField(page)).toBeVisible();
  await expect(submitButton(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/login$/);
  await expect(emailField(page)).toBeVisible();
  expect(api.filter((entry) => entry === 'GET /api/v1/products'), 'afirmación 2: una sola petición a listProducts').toHaveLength(1);
  // El loader de la pantalla (TK-03.3) lee también las alertas de stock en paralelo; no hay más peticiones ni reintentos.
  expect([...api].sort(), 'solo las dos lecturas del loader, sin reintentos ni otras llamadas').toEqual([
    'GET /api/v1/products',
    'GET /api/v1/products/alerts',
  ]);
  expect(visited.filter((p) => p === '/login'), 'una sola redirección a /login').toHaveLength(1);

  // Afirmación 5: sesión eliminada.
  expect(await readStoredSession(page), 'afirmación 5: sesión eliminada de localStorage').toBeNull();

  // Afirmación 6 (D3): no es una expiración local, no hay aviso.
  await expect(page.getByText(EXPIRED_NOTICE)).toHaveCount(0);
});
