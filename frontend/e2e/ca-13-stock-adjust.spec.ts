import { test, expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import { BACKEND_URL, E2E_OPERATOR_EMAIL, e2eOperatorPassword } from './support/e2e-env';
import { loginAsE2EOperator } from './support/session';

// TK-03.4 · CA-13 (PRD; US-03 crit. 3 y 4) · ESC-11 y ESC-12 (spec 02 §11.2, nivel E) · ESC-43 (spec 05 §11.4, nivel E,
// solo la parte STOCK_CHANGED; INVALID_ORDER_TRANSITION es TK-06.4). RN-01 (el stock no se modifica sin control).
// Matriz y fixture: docs/qa/TK-03.4-matrix.md. Decisiones de la puerta 1: D1 (fixture activo y reutilizable) y D2 (un solo test).
//
// Fixture propio, exclusivo de QA y REUTILIZABLE en medsupply_test, aislado del seed (D1): un único producto activo con
// nombre fijo (FIXTURE_NAME), preparado por la API del backend de E2E con el operador E2E, sin tocar backend/ ni el seed.
// Si existe (nombre exacto en listProducts; si hubiera varios, el de menor id), se reinicia a su estado de partida
// (updateProduct de precio, descripción y mínimo; adjustProductStock a 10 con el expectedStock leído, solo si difiere).
// Si no existe, se crea una vez. No se crea un producto por ejecución, no se borra ni se desactiva nada y no se tocan
// otros productos. El token no se imprime.

/** Nombre fijo y exclusivo del fixture de QA (no lo usa el seed ni ningún otro test). */
const FIXTURE_NAME = 'QA CA-13 fixture';
/** Estado de partida del fixture: activo, stock 10, mínimo 3, precio 10.00. */
const START = { description: null, price: '10.00', currentStock: 10, minStockAlert: 3, isActive: true } as const;
/** Botón de envío de los formularios modales de producto. */
const SUBMIT = /^(guardar|ajustar|confirmar|aceptar)\b/i;
const WAIT = { timeout: 10_000 };

// Un solo test, pero el fixture es compartido y mutable: si alguien agrega más tests a este archivo, no compiten por él.
test.describe.configure({ mode: 'serial' });

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
async function prepareActiveFixture(request: APIRequestContext): Promise<Fixture> {
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
    // No hay reactivación (DP-01, RN-10): un fixture inactivo no se puede devolver a su estado de partida.
    expect(existing.isActive, 'fixture: el producto de QA existente debe seguir activo (no se desactiva ni se reactiva)').toBe(true);
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

/** Esperas de la operación y de la recarga de ambas listas (§16.4), registradas antes del envío y con plazo propio. */
function expectMutationAndReload(page: Page, method: string, path: string): Promise<[Response, Response, Response]> {
  const at = (m: string, p: string) => (r: Response) => r.request().method() === m && new URL(r.url()).pathname === p;
  return Promise.all([
    page.waitForResponse(at(method, path), WAIT),
    page.waitForResponse(at('GET', '/api/v1/products'), WAIT),
    page.waitForResponse(at('GET', '/api/v1/products/alerts'), WAIT),
  ]);
}

test('QA-03.4-E13 CA-13: ajuste con stock vigente (ESC-11) y con stock desactualizado (ESC-12, ESC-43 STOCK_CHANGED)', async ({
  page,
  request,
}) => {
  const { id, headers, reused, sameName } = await prepareActiveFixture(request);
  const how = reused ? `reutilizado y reiniciado (${sameName} con ese nombre; se usa el de menor id)` : 'creado';
  test.info().annotations.push({ type: 'fixture', description: `producto ${id} ${how}; activo, stock 10, mínimo 3` });
  console.log(`[QA-03.4-E13] fixture ${how} en medsupply_test: producto ${id} activo (10/3), "${FIXTURE_NAME}"`);

  await loginAsE2EOperator(page);
  await page.goto('/dashboard/products');

  // 1. La fila del fixture aparece, activa y con stock 10.
  const row = page.getByRole('row').filter({ hasText: FIXTURE_NAME });
  await expect(row, 'fila del fixture en la tabla').toBeVisible();
  await expect(row).toContainText(/activo/i);
  await expect(row.getByRole('cell', { name: '10', exact: true })).toBeVisible();

  // 2. ESC-11 (E): ajuste con el stock vigente (10) a 25. El cuerpo lleva el stock mostrado como expectedStock.
  await row.getByRole('button', { name: /ajustar stock/i }).click();
  const currentDialog = page.getByRole('dialog');
  await expect(currentDialog).toBeVisible();
  await currentDialog.getByLabel('Nuevo stock', { exact: true }).fill('25');
  const applied = expectMutationAndReload(page, 'PATCH', `/api/v1/products/${id}/stock`);
  await currentDialog.getByRole('button', { name: SUBMIT }).click();
  const [appliedResponse] = await applied;
  expect(appliedResponse.status(), 'ESC-11: ajuste con el stock vigente').toBe(200);
  expect(appliedResponse.request().postDataJSON()).toEqual({ newStock: 25, expectedStock: 10 });
  await expect(currentDialog).toBeHidden();
  await expect(row.getByRole('cell', { name: '25', exact: true })).toBeVisible();
  expect((await readProduct(request, id, headers)).currentStock, 'ESC-11: el backend tiene 25').toBe(25);

  // 3. ESC-12 y ESC-43 (E): ajuste con un stock desactualizado. Se abre el diálogo con el stock mostrado (25) y, con
  // el diálogo abierto, el stock cambia por la API a 22 (un cambio que la pantalla no vio).
  await row.getByRole('button', { name: /ajustar stock/i }).click();
  const staleDialog = page.getByRole('dialog');
  await expect(staleDialog).toBeVisible();
  const concurrent = await request.patch(`${BACKEND_URL}/api/v1/products/${id}/stock`, {
    headers,
    data: { newStock: 22, expectedStock: 25 },
  });
  expect(concurrent.status(), 'cambio no visto por la pantalla (API)').toBe(200);
  expect((await readProduct(request, id, headers)).currentStock).toBe(22);

  await staleDialog.getByLabel('Nuevo stock', { exact: true }).fill('30');
  const rejected = expectMutationAndReload(page, 'PATCH', `/api/v1/products/${id}/stock`);
  await staleDialog.getByRole('button', { name: SUBMIT }).click();
  const [rejectedResponse] = await rejected; // las dos recargas ya se esperaron: GET /products y GET /products/alerts
  expect(rejectedResponse.status(), 'ESC-12: ajuste con stock desactualizado').toBe(409);
  expect(await rejectedResponse.json()).toMatchObject({ error: { code: 'STOCK_CHANGED' } });
  expect(rejectedResponse.request().postDataJSON()).toEqual({ newStock: 30, expectedStock: 25 });

  // ESC-43 (E): el conflicto se informa, la lista se recarga con el valor real y la sesión sigue activa.
  await expect(page.getByText(/el stock cambió/i), 'mensaje de conflicto visible').toBeVisible();
  await expect(row.getByRole('cell', { name: '22', exact: true }), 'la fila muestra el stock real').toBeVisible();
  await expect(row.getByRole('cell', { name: '30', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard\/products$/);
  await expect(page.getByRole('button', { name: /iniciar sesión/i }), 'sin redirección a /login').toHaveCount(0);

  // ESC-12: el stock en el backend sigue siendo el real (22), no el 30 rechazado.
  expect((await readProduct(request, id, headers)).currentStock, 'ESC-12: el backend conserva 22').toBe(22);
});
