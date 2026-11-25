import { test, expect } from '@playwright/test';
import { EXPIRED_NOTICE, emailField, loginAsE2EOperator, readStoredSession, recordApiRequests } from './support/session';

// TK-01.2 · spec 05 §15.8, US-01 crit. 5. Matriz: docs/qa/TK-01.2-matrix.md.
// Cerrar sesión es una acción del cliente: no hay endpoint de logout (contrato).

test('QA-01.2-25 ESC-38: Cerrar sesión descarta el token y el acceso posterior a /dashboard redirige a /login', async ({
  page,
}) => {
  await loginAsE2EOperator(page);
  expect(await readStoredSession(page)).not.toBeNull();
  const api = recordApiRequests(page);

  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(emailField(page)).toBeVisible();
  expect(await readStoredSession(page)).toBeNull();
  await expect(page.getByText(EXPIRED_NOTICE)).toHaveCount(0);

  // Memoria: una navegación interna a /dashboard (sin recargar, el router reacciona a popstate) no recupera la sesión.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/login$/);
  await expect(emailField(page)).toBeVisible();

  // Acceso posterior por URL (recarga completa).
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  expect(await readStoredSession(page)).toBeNull();

  expect(api, 'sin endpoint de logout ni otras llamadas').toEqual([]);
});
