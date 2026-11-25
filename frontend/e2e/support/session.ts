import { expect, type Page } from '@playwright/test';
import { E2E_OPERATOR_EMAIL, SESSION_STORAGE_KEY, e2eOperatorPassword } from './e2e-env';

// Utilidades de sesión para los E2E de TK-01.2. Selectores fijados en docs/qa/TK-01.2-matrix.md:
// campos con etiqueta "Email" y "Contraseña", botón "Iniciar sesión", entrada de menú "Cerrar sesión".

/** Aviso de sesión expirada en /login (spec 05 §16.3, DP-05): contiene "sesión" y una forma de "expir…". */
export const EXPIRED_NOTICE = /sesi[oó]n[^.]*expir/i;

/** Mensaje genérico de credenciales incorrectas (RNF-08, US-01 crit. 2); igual al ejemplo del contrato. */
export const INVALID_CREDENTIALS_MESSAGE = 'Email o contraseña incorrectos.';

export const emailField = (page: Page) => page.getByLabel('Email', { exact: true });
export const passwordField = (page: Page) => page.getByLabel('Contraseña', { exact: true });
export const submitButton = (page: Page) => page.getByRole('button', { name: 'Iniciar sesión' });

/**
 * Abre /login y comprueba que el formulario está a la vista. Se llama ANTES de crear esperas de red
 * (waitForRequest/waitForResponse): si el formulario falta, el test falla en el plazo de expect (5 s) y no
 * agota el timeout del test con una espera pendiente, que en Playwright 1.64.1 bloqueaba el cierre durante minutos.
 */
export async function openLoginForm(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(emailField(page), 'formulario de login').toBeVisible();
  await expect(passwordField(page)).toBeVisible();
  await expect(submitButton(page)).toBeVisible();
}

/** Rellena y envía el formulario de /login (navega a /login si hace falta). */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  if (!new URL(page.url(), 'http://x').pathname.endsWith('/login')) await openLoginForm(page);
  await emailField(page).fill(email);
  await passwordField(page).fill(password);
  await submitButton(page).click();
}

/** Inicia sesión con el operador E2E por la UI y espera a estar en /dashboard. Devuelve el cuerpo de login. */
export async function loginAsE2EOperator(page: Page): Promise<{ token: string; expiresAt: string }> {
  await openLoginForm(page);
  const responsePromise = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/v1/auth/login' && r.request().method() === 'POST',
  );
  await submitLogin(page, E2E_OPERATOR_EMAIL, e2eOperatorPassword());
  const response = await responsePromise;
  expect(response.status(), 'login del operador E2E').toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  return (await response.json()) as { token: string; expiresAt: string };
}

/** Registra, desde ahora, las rutas de cada petición a /api que hace la página. */
export function recordApiRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) seen.push(`${request.method()} ${url.pathname}`);
  });
  return seen;
}

export function readStoredSession(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), SESSION_STORAGE_KEY);
}

/** Guarda una sesión en localStorage con el formato de QA-01.2-03 (la página debe estar en el origen de la app). */
export async function storeSession(
  page: Page,
  session: { token: string; expiresAt: string; operatorName: string },
): Promise<void> {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SESSION_STORAGE_KEY, JSON.stringify(session)] as const,
  );
}

/** Sesión con expiresAt ya vencido. El token no es válido: si se llegara a enviar, el registro de peticiones lo detecta. */
export function expiredSession(): { token: string; expiresAt: string; operatorName: string } {
  return { token: 'e2e.token.vencido', expiresAt: new Date(Date.now() - 60_000).toISOString(), operatorName: 'Vencida' };
}
