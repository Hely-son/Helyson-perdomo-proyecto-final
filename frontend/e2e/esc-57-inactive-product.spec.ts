import { test, expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import { BACKEND_URL, E2E_OPERATOR_EMAIL, e2eOperatorPassword } from './support/e2e-env';
import { loginAsE2EOperator } from './support/session';

// TK-03.3 · ESC-57 (spec 05 §11.8, §16.4 "Productos inactivos"; spec 02 DP-01, DP-02; RN-09, RN-10). Nivel E
// obligatorio (decisión D6 de la puerta 1). Matriz y contrato de selectores: docs/qa/TK-03.3-matrix.md (E57).
// Fixture propio y REUTILIZABLE en medsupply_test, aislado del seed de desarrollo (decisiones D3 y ajuste de fase 1):
// un único producto de QA con nombre fijo y exclusivo (FIXTURE_NAME), preparado por la API del backend de E2E con el
// operador E2E, sin tocar backend/ ni el seed. Si existe (nombre exacto en listProducts; si hubiera varios, el de menor
// id), se reinicia a su estado de partida (updateProduct de precio, descripción y mínimo; adjustProductStock a 1 con
// el expectedStock leído; deactivateProduct si estuviera activo). Si no existe, se crea y se desactiva. No se tocan
// otros productos ni se borra nada (no hay borrado ni reactivación: DP-01, RN-10). El token no se imprime.

/** Nombre fijo y exclusivo del fixture de QA (no lo usa el seed ni ningún otro test). */
const FIXTURE_NAME = 'QA ESC-57 fixture';
/** Estado de partida del fixture: inactivo, stock 1, mínimo 3 (ESC-57), precio 10.00. */
const START = { description: null, price: '10.00', currentStock: 1, minStockAlert: 3, isActive: false } as const;
/** Botón de envío de los formularios modales de producto. */
const SUBMIT = /^(guardar|ajustar|confirmar|aceptar)\b/i;
const WAIT = { timeout: 10_000 };

interface ApiProduct {
  id: number;
  name: string;
  description: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
  isActive: boolean;
}

interface Fixture {
  id: number;
  headers: Record<string, string>;
  reused: boolean;
  /** Productos con FIXTURE_NAME exacto antes de preparar (se usa el de menor id). */
  sameName: number;
}

/** Prepara el fixture en su estado de partida; solo opera sobre el producto con FIXTURE_NAME exacto de menor id. */
async function prepareInactiveFixture(request: APIRequestContext): Promise<Fixture> {
  const login = await request.post(`${BACKEND_URL}/api/v1/auth/login`, {
    data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() },
  });
  expect(login.status(), 'fixture: login del operador E2E por la API').toBe(200);
  const { token } = (await login.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };
  const url = (path: string) => `${BACKEND_URL}/api/v1${path}`;

  const listed = await request.get(url('/products'), { headers });
  expect(listed.status(), 'fixture: listProducts').toBe(200);
  const matches = ((await listed.json()) as { items: ApiProduct[] }).items
    .filter((p) => p.name === FIXTURE_NAME)
    .sort((a, b) => a.id - b.id);

  let id: number;
  const existing = matches[0];
  if (existing === undefined) {
    const created = await request.post(url('/products'), {
      headers,
      data: { name: FIXTURE_NAME, description: START.description, price: START.price, currentStock: START.currentStock, minStockAlert: START.minStockAlert },
    });
    expect(created.status(), 'fixture: createProduct').toBe(201);
    id = ((await created.json()) as ApiProduct).id;
  } else {
    id = existing.id;
    const updated = await request.patch(url(`/products/${id}`), {
      headers,
      data: { description: START.description, price: START.price, minStockAlert: START.minStockAlert },
    });
    expect(updated.status(), 'fixture: updateProduct (reinicio)').toBe(200);
    const current = (await updated.json()) as ApiProduct;
    if (current.currentStock !== START.currentStock) {
      const adjusted = await request.patch(url(`/products/${id}/stock`), {
        headers,
        data: { newStock: START.currentStock, expectedStock: current.currentStock },
      });
      expect(adjusted.status(), 'fixture: adjustProductStock (reinicio)').toBe(200);
    }
  }
  if (existing === undefined || existing.isActive) {
    const deactivated = await request.post(url(`/products/${id}/deactivate`), { headers });
    expect(deactivated.status(), 'fixture: deactivateProduct').toBe(200);
  }

  expect(await readProduct(request, id, headers), 'fixture: estado de partida').toMatchObject({
    id,
    name: FIXTURE_NAME,
    ...START,
  });
  return { id, headers, reused: existing !== undefined, sameName: matches.length };
}

async function readProduct(request: APIRequestContext, id: number, headers: Record<string, string>): Promise<ApiProduct> {
  const response = await request.get(`${BACKEND_URL}/api/v1/products/${id}`, { headers });
  expect(response.status()).toBe(200);
  return (await response.json()) as ApiProduct;
}

async function alertIds(request: APIRequestContext, headers: Record<string, string>): Promise<number[]> {
  const response = await request.get(`${BACKEND_URL}/api/v1/products/alerts`, { headers });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { items: ApiProduct[] }).items.map((p) => p.id);
}

/** Esperas de la operación y de la recarga de ambas listas (§16.4), registradas antes del envío y con plazo propio. */
function expectMutationAndReload(page: Page, method: string, path: string): Promise<[Response, Response, Response]> {
  const at = (m: string, p: string) => (r: Response) => r.request().method() === m && new URL(r.url()).pathname === p;
  return Promise.all([
    page.waitForResponse(at(method, path), WAIT),
    page.waitForResponse(at('GET', '/api/v1/products'), WAIT),
    page.waitForResponse(at('GET', '/api/v1/products/alerts'), WAIT),
  ]);
}

test('QA-03.3-E57 ESC-57: producto inactivo (1/3) sin resaltar, con editar y ajustar stock y sin reactivación', async ({
  page,
  request,
}) => {
  const { id, headers, reused, sameName } = await prepareInactiveFixture(request);
  const name = FIXTURE_NAME;
  const how = reused ? `reutilizado y reiniciado (${sameName} con ese nombre; se usa el de menor id)` : 'creado';
  test.info().annotations.push({ type: 'fixture', description: `producto ${id} ${how}; inactivo, stock 1, mínimo 3` });
  console.log(`[QA-03.3-E57] fixture ${how} en medsupply_test: producto ${id} inactivo (1/3), "${name}"`);
  expect(await alertIds(request, headers), 'precondición: el backend no lo incluye en alertas').not.toContain(id);

  await loginAsE2EOperator(page);
  await page.goto('/dashboard/products');

  // La fila aparece, como inactiva y sin resaltar; acciones: editar y ajustar stock; ninguna (re)activación.
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row, 'fila del producto inactivo en la tabla').toBeVisible();
  await expect(row).toContainText(/inactivo/i);
  await expect(row).not.toHaveClass(/\bis-stock-critical\b/);
  await expect(row.getByRole('button', { name: /editar/i })).toBeVisible();
  await expect(row.getByRole('button', { name: /ajustar stock/i })).toBeVisible();
  await expect(row.getByRole('button', { name: /activar/i }), 'sin reactivar ni desactivar en una fila inactiva').toHaveCount(0);
  await expect(page.getByRole('button', { name: /reactivar/i })).toHaveCount(0);

  // Editar el precio.
  await row.getByRole('button', { name: /editar/i }).click();
  const editDialog = page.getByRole('dialog');
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel('Precio', { exact: true }).fill('12.50');
  const edited = expectMutationAndReload(page, 'PATCH', `/api/v1/products/${id}`);
  await editDialog.getByRole('button', { name: SUBMIT }).click();
  const [editResponse] = await edited;
  expect(editResponse.status()).toBe(200);
  const editBody = editResponse.request().postDataJSON() as Record<string, unknown>;
  expect(editBody).toMatchObject({ price: '12.50' });
  expect(editBody).not.toHaveProperty('isActive'); // UpdateProductRequest no admite isActive (DP-01, ESC-33)
  expect(editBody).not.toHaveProperty('currentStock'); // el stock solo cambia con adjustProductStock (IN-02)
  await expect(editDialog).toBeHidden();
  await expect(row).toContainText(/inactivo/i);
  await expect(row).not.toHaveClass(/\bis-stock-critical\b/);

  // Ajustar el stock con el expectedStock mostrado (1) a 2, que sigue ≤ mínimo: inactivo, no se resalta.
  await row.getByRole('button', { name: /ajustar stock/i }).click();
  const adjustDialog = page.getByRole('dialog');
  await expect(adjustDialog).toBeVisible();
  await adjustDialog.getByLabel('Nuevo stock', { exact: true }).fill('2');
  const adjusted = expectMutationAndReload(page, 'PATCH', `/api/v1/products/${id}/stock`);
  await adjustDialog.getByRole('button', { name: SUBMIT }).click();
  const [adjustResponse] = await adjusted;
  expect(adjustResponse.status()).toBe(200);
  expect(adjustResponse.request().postDataJSON()).toEqual({ newStock: 2, expectedStock: 1 });
  await expect(adjustDialog).toBeHidden();
  await expect(row.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await expect(row).toContainText(/inactivo/i);
  await expect(row).not.toHaveClass(/\bis-stock-critical\b/);
  await expect(row.getByRole('button', { name: /activar/i })).toHaveCount(0);

  // Estado en el backend: ambas operaciones aplicadas, sigue inactivo y fuera de alertas.
  expect(await readProduct(request, id, headers)).toMatchObject({ price: '12.50', currentStock: 2, minStockAlert: 3, isActive: false });
  expect(await alertIds(request, headers)).not.toContain(id);
});
