import { test, expect } from '@playwright/test';
import { loginAsE2EOperator } from './support/session';

// QA-01.2-26 · ESC-40 completo (TK-01.2). Sustituye a QA-00.5-31 (parcial, sin sesión): ahora el dashboard
// exige sesión, así que se inicia sesión antes, y "Cerrar sesión" debe estar habilitado. Su efecto lo prueba
// QA-01.2-25 (logout.spec.ts). Matriz: docs/qa/TK-01.2-matrix.md.
test('QA-01.2-26 ESC-40: menú y navegación del dashboard con sesión iniciada', async ({ page }) => {
  await loginAsE2EOperator(page);

  const menu = page.getByRole('menu');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();

  const items = menu.getByRole('menuitem');
  await expect(items).toHaveText(['Inicio', 'Productos', 'Pedidos', 'Cerrar sesión']);
  const logout = menu.getByRole('menuitem', { name: 'Cerrar sesión' });
  await expect(logout).toHaveCount(1);
  await expect(logout).not.toHaveAttribute('aria-disabled', 'true');

  await menu.getByRole('menuitem', { name: 'Productos' }).click();
  await expect(page).toHaveURL(/\/dashboard\/products$/);
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();

  await menu.getByRole('menuitem', { name: 'Pedidos' }).click();
  await expect(page).toHaveURL(/\/dashboard\/orders$/);
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible();

  await menu.getByRole('menuitem', { name: 'Inicio' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();

  for (const absent of [/clientes/i, /reclamos/i, /reposici/i]) {
    await expect(menu.getByRole('menuitem', { name: absent })).toHaveCount(0);
  }
});
