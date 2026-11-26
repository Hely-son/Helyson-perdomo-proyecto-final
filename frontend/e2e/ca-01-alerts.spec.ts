import { test, expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import { BACKEND_URL, E2E_OPERATOR_EMAIL, e2eOperatorPassword } from './support/e2e-env';
import { loginAsE2EOperator } from './support/session';

// TK-04.5 · CA-01 (PRD; US-04 crit. 1) · ESC-20 (spec 02 §11.3, nivel E) · ESC-54 (spec 05 §16.4, nivel E).
// RN-09 (alerta: activo y stock <= mínimo), RN-10 y DP-01/DP-02/DP-04 (spec 02). Matriz y decisiones de la puerta 1
// (D1: dos fixtures; D2: ESC-54 nivel E; D3: ESC-55 nivel E no se incluye): docs/qa/TK-04.5-matrix.md.
//
// Fixtures propios, exclusivos de este archivo y REUTILIZABLES en medsupply_test, aislados del seed (que esa base no
// contiene). Se preparan por la API del backend de E2E con el operador E2E, sin tocar backend/ ni el seed: se busca por
// nombre exacto en listProducts (si hubiera varios, el de menor id); se crea solo si no existe; nunca se duplica ni se
// borra. El token no se imprime. Las aserciones son siempre por el nombre exacto del fixture, nunca por conteos globales.
//  - ACTIVE_NAME: activo, stock 10 y mínimo 5 al iniciar cada ejecución (se reinicia).
//  - INACTIVE_NAME: inactivo con stock <= mínimo (1/3). Representa "el producto inactivo del seed" de ESC-20.

const ACTIVE_NAME = 'QA CA-01 active fixture';
const INACTIVE_NAME = 'QA CA-01 inactive fixture';
const ACTIVE_START = { description: null, price: '10.00', currentStock: 10, minStockAlert: 5, isActive: true } as const;
const INACTIVE_START = { description: null, price: '10.00', currentStock: 1, minStockAlert: 3, isActive: false } as const;
/** Botón de envío de los formularios modales de producto. */
const SUBMIT = /^(guardar|ajustar|confirmar|aceptar)\b/i;
const WAIT = { timeout: 10_000 };

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

interface Fixtures {
  activeId: number;
  inactiveId: number;
  headers: Record<string, string>;
  how: string;
}

const url = (path: string) => `${BACKEND_URL}/api/v1${path}`;

async function readProduct(request: APIRequestContext, id: number, headers: Record<string, string>): Promise<ApiProduct> {
  const response = await request.get(url(`/products/${id}`), { headers });
  expect(response.status()).toBe(200);
  return (await response.json()) as ApiProduct;
}

async function alertIds(request: APIRequestContext, headers: Record<string, string>): Promise<number[]> {
  const response = await request.get(url('/products/alerts'), { headers });
  expect(response.status(), 'listStockAlerts').toBe(200);
  return ((await response.json()) as { items: ApiProduct[] }).items.map((p) => p.id);
}

/**
 * Deja un fixture en su estado de partida (updateProduct de precio, descripción y mínimo; adjustProductStock con el
 * expectedStock leído, solo si difiere). Si no existe lo crea. Devuelve el id y si se reutilizó.
 */
async function ensureFixture(
  request: APIRequestContext,
  headers: Record<string, string>,
  name: string,
  start: { description: null; price: string; currentStock: number; minStockAlert: number },
  existing: ApiProduct | undefined,
): Promise<{ id: number; current: ApiProduct | null }> {
  if (existing === undefined) {
    const created = await request.post(url('/products'), {
      headers,
      data: { name, description: start.description, price: start.price, currentStock: start.currentStock, minStockAlert: start.minStockAlert },
    });
    expect(created.status(), `fixture ${name}: createProduct`).toBe(201);
    return { id: ((await created.json()) as ApiProduct).id, current: null };
  }
  const updated = await request.patch(url(`/products/${existing.id}`), {
    headers,
    data: { description: start.description, price: start.price, minStockAlert: start.minStockAlert },
  });
  expect(updated.status(), `fixture ${name}: updateProduct (reinicio)`).toBe(200);
  const current = (await updated.json()) as ApiProduct;
  if (current.currentStock !== start.currentStock) {
    const adjusted = await request.patch(url(`/products/${existing.id}/stock`), {
      headers,
      data: { newStock: start.currentStock, expectedStock: current.currentStock },
    });
    expect(adjusted.status(), `fixture ${name}: adjustProductStock (reinicio)`).toBe(200);
  }
  return { id: existing.id, current };
}

async function prepareFixtures(request: APIRequestContext): Promise<Fixtures> {
  const login = await request.post(url('/auth/login'), {
    data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() },
  });
  expect(login.status(), 'fixture: login del operador E2E por la API').toBe(200);
  const { token } = (await login.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };

  const listed = await request.get(url('/products'), { headers });
  expect(listed.status(), 'fixture: listProducts').toBe(200);
  const items = ((await listed.json()) as { items: ApiProduct[] }).items;
  const lowest = (name: string) => items.filter((p) => p.name === name).sort((a, b) => a.id - b.id)[0];
  const existingActive = lowest(ACTIVE_NAME);
  const existingInactive = lowest(INACTIVE_NAME);

  // Fixture activo: no hay reactivación (DP-01, RN-10); si existiera inactivo no se puede devolver a su estado de partida.
  if (existingActive !== undefined) {
    expect(
      existingActive.isActive,
      `fixture: "${ACTIVE_NAME}" (id ${existingActive.id}) existe inactivo y no hay reactivación (DP-01); no se puede reutilizar`,
    ).toBe(true);
  }
  const active = await ensureFixture(request, headers, ACTIVE_NAME, ACTIVE_START, existingActive);

  // Fixture inactivo: si se creó o estaba activo, se desactiva (deactivateProduct); DP-02 permite reiniciar su stock/mínimo.
  const inactive = await ensureFixture(request, headers, INACTIVE_NAME, INACTIVE_START, existingInactive);
  if (existingInactive === undefined || existingInactive.isActive) {
    const deactivated = await request.post(url(`/products/${inactive.id}/deactivate`), { headers });
    expect(deactivated.status(), `fixture ${INACTIVE_NAME}: deactivateProduct`).toBe(200);
  }

  expect(await readProduct(request, active.id, headers), 'fixture activo: estado de partida').toMatchObject({
    id: active.id,
    name: ACTIVE_NAME,
    ...ACTIVE_START,
  });
  expect(await readProduct(request, inactive.id, headers), 'fixture inactivo: estado de partida').toMatchObject({
    id: inactive.id,
    name: INACTIVE_NAME,
    ...INACTIVE_START,
  });

  const describe = (n: string, id: number, existing: ApiProduct | undefined) =>
    `${n}: id ${id} ${existing === undefined ? 'creado' : 'reutilizado y reiniciado'}`;
  return {
    activeId: active.id,
    inactiveId: inactive.id,
    headers,
    how: `${describe('activo', active.id, existingActive)}; ${describe('inactivo', inactive.id, existingInactive)}`,
  };
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

/** Navega a Inicio por el menú y devuelve los ítems que el panel recibió de listStockAlerts en esa carga. */
async function openHomeAndReadAlerts(page: Page): Promise<ApiProduct[]> {
  const alertsResponse = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/products/alerts',
    WAIT,
  );
  await page.getByRole('menu').getByRole('menuitem', { name: 'Inicio' }).click();
  const response = await alertsResponse;
  expect(response.status(), 'el panel lee listStockAlerts').toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();
  await expect(page.getByRole('table'), 'el panel muestra su tabla de alertas').toBeVisible();
  return ((await response.json()) as { items: ApiProduct[] }).items;
}

const rowOf = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });

test('QA-04.5-E20-54 CA-01 / ESC-20 / ESC-54: ajustar el stock a <= mínimo lleva el producto activo a alertas (el inactivo no); subir el umbral lo saca', async ({
  page,
  request,
}) => {
  const { activeId, inactiveId, headers, how } = await prepareFixtures(request);
  test.info().annotations.push({ type: 'fixture', description: how });
  console.log(`[QA-04.5-E20-54] fixtures en medsupply_test: ${how}`);

  // Precondiciones por la API (RN-09): el activo (10/5) no está en alertas; el inactivo SÍ cumple stock <= mínimo (1/3)
  // y aun así no está en alertas porque está inactivo.
  const inactiveStart = await readProduct(request, inactiveId, headers);
  expect(inactiveStart, 'precondición: el inactivo está inactivo y cumple stock <= mínimo').toMatchObject({ isActive: false });
  expect(inactiveStart.currentStock).toBeLessThanOrEqual(inactiveStart.minStockAlert);
  const initialAlerts = await alertIds(request, headers);
  expect(initialAlerts, 'precondición: el activo 10/5 no está en alertas').not.toContain(activeId);
  expect(initialAlerts, 'precondición: el inactivo (<= mínimo) no está en alertas').not.toContain(inactiveId);

  await loginAsE2EOperator(page);
  await page.goto('/dashboard/products');
  const activeRow = rowOf(page, ACTIVE_NAME);
  const inactiveRow = rowOf(page, INACTIVE_NAME);

  await test.step('Productos: el activo 10/5 y el inactivo 1/3 aparecen sin resaltar', async () => {
    await expect(activeRow, 'fila del fixture activo').toBeVisible();
    await expect(activeRow).toContainText(/activo/i);
    await expect(activeRow).not.toHaveClass(/\bis-stock-critical\b/);
    await expect(activeRow.getByRole('cell', { name: '10', exact: true })).toBeVisible();
    await expect(inactiveRow, 'fila del fixture inactivo').toBeVisible();
    await expect(inactiveRow).toContainText(/inactivo/i);
    await expect(inactiveRow, 'inactivo con stock <= mínimo: sin resaltar (DP-04)').not.toHaveClass(/\bis-stock-critical\b/);
  });

  await test.step('ESC-20 / ESC-54: ajustar 10 -> 5 desde la UI; se recargan ambas listas y el producto se resalta', async () => {
    await activeRow.getByRole('button', { name: /ajustar stock/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Nuevo stock', { exact: true }).fill('5');
    const applied = expectMutationAndReload(page, 'PATCH', `/api/v1/products/${activeId}/stock`);
    await dialog.getByRole('button', { name: SUBMIT }).click();
    const [adjustResponse] = await applied; // las dos recargas ya se esperaron: GET /products y GET /products/alerts
    expect(adjustResponse.status()).toBe(200);
    expect(adjustResponse.request().postDataJSON()).toEqual({ newStock: 5, expectedStock: 10 });
    await expect(dialog).toBeHidden();
    await expect(activeRow, 'ESC-54: el activo 5/5 se resalta').toHaveClass(/\bis-stock-critical\b/);
    await expect(inactiveRow, 'el inactivo sigue sin resaltar').not.toHaveClass(/\bis-stock-critical\b/);
    expect(await readProduct(request, activeId, headers)).toMatchObject({ currentStock: 5, minStockAlert: 5, isActive: true });
  });

  await test.step('ESC-20 / CA-01: en Inicio el panel muestra el activo (5/5) y no el inactivo', async () => {
    const received = await openHomeAndReadAlerts(page);
    expect(received.map((p) => p.id), 'el panel recibió el activo y no el inactivo').toContain(activeId);
    expect(received.map((p) => p.id)).not.toContain(inactiveId);
    const row = rowOf(page, ACTIVE_NAME);
    await expect(row, 'fila del activo en el panel de alertas').toBeVisible();
    await expect(row.getByRole('cell'), 'nombre, stock actual y mínimo').toHaveText([ACTIVE_NAME, '5', '5']);
    await expect(rowOf(page, INACTIVE_NAME), 'el inactivo (1/3) no aparece en el panel').toHaveCount(0);
  });

  await test.step('ESC-54: cambiar el mínimo a 4 desde la UI saca al producto de alertas y del resaltado', async () => {
    await page.getByRole('menu').getByRole('menuitem', { name: 'Productos' }).click();
    await expect(page).toHaveURL(/\/dashboard\/products$/);
    await expect(activeRow).toHaveClass(/\bis-stock-critical\b/);

    await activeRow.getByRole('button', { name: /editar/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Stock mínimo', { exact: true }).fill('4');
    const applied = expectMutationAndReload(page, 'PATCH', `/api/v1/products/${activeId}`);
    await dialog.getByRole('button', { name: SUBMIT }).click();
    const [editResponse] = await applied;
    expect(editResponse.status()).toBe(200);
    expect(editResponse.request().postDataJSON()).toEqual({ minStockAlert: 4 });
    await expect(dialog).toBeHidden();
    await expect(activeRow, 'ESC-54: con 5 > 4 deja de resaltarse').not.toHaveClass(/\bis-stock-critical\b/);
    await expect(inactiveRow).not.toHaveClass(/\bis-stock-critical\b/);
    expect(await readProduct(request, activeId, headers)).toMatchObject({ currentStock: 5, minStockAlert: 4, isActive: true });

    const received = await openHomeAndReadAlerts(page);
    expect(received.map((p) => p.id), 'el panel ya no recibe el activo').not.toContain(activeId);
    expect(received.map((p) => p.id)).not.toContain(inactiveId);
    await expect(rowOf(page, ACTIVE_NAME), 'ESC-54: el activo deja de aparecer en el panel').toHaveCount(0);
    await expect(rowOf(page, INACTIVE_NAME)).toHaveCount(0);
    expect(await alertIds(request, headers)).not.toContain(activeId);
  });
});
