import { test, expect } from '@playwright/test';
import {
  EXPIRED_NOTICE,
  emailField,
  expiredSession,
  loginAsE2EOperator,
  readStoredSession,
  recordApiRequests,
  storeSession,
} from './support/session';

// TK-01.2 · spec 05 §15.4 (DP-05), §15.5, §16.2 (DP-07), §16.3 (DP-06). Matriz: docs/qa/TK-01.2-matrix.md.
// "No hay bucle": la URL final es estable y la pantalla de destino está a la vista.

const PROTECTED = ['/dashboard', '/dashboard/products', '/dashboard/orders'];

test.describe('QA-01.2-20 ESC-36 (CA-11, sin sesión): acceso directo a rutas protegidas', () => {
  for (const path of PROTECTED) {
    test(`${path} sin token → /login, sin llamar a la API ni avisar de expiración`, async ({ page }) => {
      const api = recordApiRequests(page);
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(emailField(page)).toBeVisible();
      await expect(page.getByText(EXPIRED_NOTICE)).toHaveCount(0);
      expect(api).toEqual([]);
    });
  }
});

test('QA-01.2-21 ESC-46 (E, CA-11 sesión expirada): carga directa de /dashboard/orders con expiresAt vencido', async ({
  page,
}) => {
  await page.goto('/login');
  await storeSession(page, expiredSession());
  const api = recordApiRequests(page);

  await page.goto('/dashboard/orders');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(EXPIRED_NOTICE)).toBeVisible();
  await expect(emailField(page)).toBeVisible();
  expect(await readStoredSession(page)).toBeNull();
  expect(api, 'ninguna petición a la API').toEqual([]);

  // El aviso se consume una vez: un nuevo acceso sin sesión no lo repite.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(EXPIRED_NOTICE)).toHaveCount(0);
});

test('QA-01.2-22 ESC-46 (E, navegación interna): el plazo vence con la app abierta y se navega a Pedidos', async ({
  page,
}) => {
  await page.clock.install();
  const { expiresAt } = await loginAsE2EOperator(page);
  await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();

  const api = recordApiRequests(page);
  await page.clock.setSystemTime(Date.parse(expiresAt) + 60_000);
  await page.getByRole('menu').getByRole('menuitem', { name: 'Pedidos' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(EXPIRED_NOTICE)).toBeVisible();
  expect(await readStoredSession(page)).toBeNull();
  expect(api, 'ninguna petición a la API tras vencer el plazo').toEqual([]);
});

test.describe('QA-01.2-23 ESC-48 (E): abrir /login según la sesión', () => {
  test('(a) sesión válida → /dashboard, sin bucle', async ({ page }) => {
    await loginAsE2EOperator(page);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('(b) sin token → formulario', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);
    await expect(emailField(page)).toBeVisible();
    await expect(page.getByText(EXPIRED_NOTICE)).toHaveCount(0);
  });

  test('(c) token vencido → limpia la sesión y muestra el formulario, sin bucle', async ({ page }) => {
    await page.goto('/login');
    await storeSession(page, expiredSession());
    const api = recordApiRequests(page);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login$/);
    await expect(emailField(page)).toBeVisible();
    // Llegada directa con token vencido (§16.3 "Token vencido", decisión del usuario 2026-11-25): sin aviso de expiración.
    await expect(page.getByText(EXPIRED_NOTICE)).toHaveCount(0);
    await expect.poll(() => readStoredSession(page)).toBeNull();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/login$/);
    expect(api).toEqual([]);
  });
});

test.describe('QA-01.2-24 ESC-49 (E; DP-07): rutas desconocidas y V2', () => {
  const UNKNOWN = ['/dashboard/inexistente', '/dashboard/claims', '/'];
  const NOT_FOUND = /no encontrad|not found|404/i;

  test('(a) con sesión válida → /dashboard, sin pantalla de "no encontrado"', async ({ page }) => {
    await loginAsE2EOperator(page);
    for (const path of UNKNOWN) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();
      await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    }
  });

  test('(b) sin sesión → /login, sin pantalla de "no encontrado"', async ({ page }) => {
    for (const path of UNKNOWN) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
      await expect(emailField(page)).toBeVisible();
      await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    }
  });
});
