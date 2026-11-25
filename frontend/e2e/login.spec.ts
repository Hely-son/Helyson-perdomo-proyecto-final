import { test, expect } from '@playwright/test';
import { E2E_OPERATOR_EMAIL, E2E_OPERATOR_NAME, e2eOperatorPassword } from './support/e2e-env';
import {
  INVALID_CREDENTIALS_MESSAGE,
  emailField,
  loginAsE2EOperator,
  openLoginForm,
  passwordField,
  readStoredSession,
  recordApiRequests,
  submitButton,
  submitLogin,
} from './support/session';

// TK-01.2 · spec 05 §16.3, §15.2, §15.7, §16.2 (DP-09). Matriz: docs/qa/TK-01.2-matrix.md.

test('QA-01.2-16 ESC-33 (parcial: encabezado; el panel es de TK-04.3): login válido navega a /dashboard y guarda la sesión', async ({
  page,
  baseURL,
}) => {
  await openLoginForm(page);
  const loginRequest = page.waitForRequest((r) => r.url().includes('/auth/login'));
  const loginResponse = page.waitForResponse((r) => r.url().includes('/auth/login'));
  await submitLogin(page, E2E_OPERATOR_EMAIL, e2eOperatorPassword());

  // D24 (parte local): el login va al mismo origen de la app y a /api/v1/auth/login, sin otro origen ni el puerto 3100.
  const request = await loginRequest;
  expect(request.method()).toBe('POST');
  expect(new URL(request.url()).origin).toBe(new URL(baseURL as string).origin);
  expect(new URL(request.url()).pathname).toBe('/api/v1/auth/login');

  const response = await loginResponse;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { token: string; expiresAt: string };

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();

  // §15.7 y DP-09: token, expiresAt y operator.name guardados juntos en localStorage.
  const stored = await readStoredSession(page);
  expect(stored, 'sesión guardada en localStorage').not.toBeNull();
  const parsed = JSON.parse(stored as string) as Record<string, unknown>;
  expect(parsed.token === body.token, 'el token guardado es el de la respuesta de login').toBe(true);
  expect(parsed.expiresAt).toBe(body.expiresAt);
  expect(parsed.operatorName).toBe(E2E_OPERATOR_NAME);
});

test('QA-01.2-17 ESC-34: credenciales incorrectas → mensaje genérico, sigue en /login, sin token', async ({ page }) => {
  for (const [email, password] of [
    [E2E_OPERATOR_EMAIL, 'contraseña-incorrecta-e2e'],
    ['no.existe.e2e@medsupply.test', 'cualquier-contraseña'],
  ]) {
    await openLoginForm(page);
    await expect(page.getByText(INVALID_CREDENTIALS_MESSAGE, { exact: true })).toHaveCount(0);
    const response = page.waitForResponse((r) => r.url().includes('/auth/login'));
    await emailField(page).fill(email);
    await passwordField(page).fill(password);
    await submitButton(page).click();
    expect((await response).status()).toBe(401);

    // US-01 crit. 2 y RNF-08: el mismo mensaje para contraseña incorrecta y email inexistente.
    await expect(page.getByText(INVALID_CREDENTIALS_MESSAGE, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(await readStoredSession(page)).toBeNull();
    // ESC-39 (E): no se aplica la redirección global de §15.6 ni se vacía el formulario.
    await expect(emailField(page)).toHaveValue(email);
  }
});

test.describe('QA-01.2-18 ESC-35 (E): validación local, con error junto al campo y sin petición a login', () => {
  const cases = [
    { name: 'email vacío', email: '', password: 'algo', invalid: ['email'] },
    { name: 'contraseña vacía', email: 'operador.e2e@medsupply.test', password: '', invalid: ['password'] },
    { name: 'email sin formato', email: 'operador-sin-arroba', password: 'algo', invalid: ['email'] },
    { name: 'ambos vacíos', email: '', password: '', invalid: ['email', 'password'] },
  ];

  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await openLoginForm(page);
      const api = recordApiRequests(page);
      if (c.email) await emailField(page).fill(c.email);
      if (c.password) await passwordField(page).fill(c.password);
      await submitButton(page).click();

      // "Junto al campo": el mensaje es la descripción accesible del propio campo (aria-describedby de Form.Item).
      for (const field of ['email', 'password']) {
        const locator = field === 'email' ? emailField(page) : passwordField(page);
        if (c.invalid.includes(field)) await expect(locator).toHaveAccessibleDescription(/\S/);
        else await expect(locator).not.toHaveAccessibleDescription(/\S/);
      }
      await page.waitForTimeout(500);
      expect(api, 'ninguna petición a la API').toEqual([]);
      await expect(page).toHaveURL(/\/login$/);
    });
  }
});

test('QA-01.2-19 ESC-50: el layout muestra el nombre del operador junto a Cerrar sesión, sin llamadas adicionales', async ({
  page,
}) => {
  const api = recordApiRequests(page);
  await loginAsE2EOperator(page);

  const logout = page.getByRole('menuitem', { name: 'Cerrar sesión' });
  await expect(logout).toBeVisible();
  await expect(page.getByText(E2E_OPERATOR_NAME, { exact: true })).toBeVisible();

  // Tras una recarga el nombre sigue saliendo de la sesión guardada (§15.7), sin pedirlo a la API.
  await page.reload();
  await expect(page.getByText(E2E_OPERATOR_NAME, { exact: true })).toBeVisible();
  await expect(logout).toBeVisible();

  // La única llamada propia del acceso es login. Se admite la carga de datos de la pantalla de inicio
  // (listStockAlerts, TK-04.3); cualquier otra llamada (p. ej. para obtener el nombre) incumple DP-09.
  const allowed = new Set(['POST /api/v1/auth/login', 'GET /api/v1/products/alerts']);
  expect(api.filter((r) => !allowed.has(r)), 'llamadas a la API no previstas').toEqual([]);
  expect(api.filter((r) => r === 'POST /api/v1/auth/login')).toHaveLength(1);
});
