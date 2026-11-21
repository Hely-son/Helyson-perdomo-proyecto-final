import { test, expect } from '@playwright/test';

// QA-00.5-31 y QA-00.5-23 · ESC-40 (parcial, sin sesión): menú y navegación del dashboard.
// No cubre el cierre de sesión ni la sesión (TK-01.2): solo comprueba que "Cerrar sesión" existe.
test('QA-00.5-31 ESC-40 (parcial, sin sesión): menú y navegación del dashboard', async ({ page }) => {
  await page.goto('/dashboard');

  const menu = page.getByRole('menu');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();

  const items = menu.getByRole('menuitem');
  await expect(items).toHaveText(['Inicio', 'Productos', 'Pedidos', 'Cerrar sesión']);
  await expect(menu.getByRole('menuitem', { name: 'Cerrar sesión' })).toHaveCount(1);

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
