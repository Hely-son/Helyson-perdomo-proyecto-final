import { test, expect, type APIRequestContext } from '@playwright/test';
import { BACKEND_URL, E2E_OPERATOR_EMAIL, e2eOperatorPassword } from './support/e2e-env';
import { loginAsE2EOperator, recordApiRequests } from './support/session';

// TK-04.3 · ESC-33 (spec 05 §11.4, nivel E; parte pendiente de TK-01.2: "muestra el panel de alertas") y ESC-22
// (spec 02 §11.3, nivel E: el panel no ofrece "Reponer" ni ninguna acción V2). Spec 02 F-6; spec 05 §16.1, §16.4.
// Matriz y fixture: docs/qa/TK-04.3-matrix.md. Decisión D2 de la puerta 1: una E2E pequeña; CA-01 completo (ajustar el
// stock y ver el producto en alertas; el inactivo no aparece) es de TK-04.5 y NO se repite aquí.
//
// Fixture propio, exclusivo de este archivo y REUTILIZABLE en medsupply_test: la base de E2E no contiene los productos
// del seed (solo los fixtures de QA), así que no hay ningún producto en alerta del seed que mirar. Se prepara por la API
// del backend de E2E con el operador E2E, sin tocar backend/ ni el seed (mismo criterio que TK-03.4, D1): si existe (nombre
// exacto; si hubiera varios, el de menor id) se reinicia a su estado de partida; si no, se crea una vez. No se crea un
// producto por ejecución, no se borra ni se desactiva nada y no se tocan otros productos. El token no se imprime.

/** Nombre fijo y exclusivo del fixture (no lo usa el seed ni ningún otro test). */
const FIXTURE_NAME = 'QA TK-04.3 alert fixture';
/** Estado de partida: activo, stock 2 y mínimo 3, es decir, siempre en alerta (RN-09: stock <= mínimo). */
const START = { description: null, price: '10.00', currentStock: 2, minStockAlert: 3, isActive: true } as const;

interface ApiProduct {
  id: number;
  name: string;
  description: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
  isActive: boolean;
}

/** Prepara el fixture en su estado de partida y comprueba por la API que figura en alertas. Devuelve su id. */
async function prepareAlertFixture(request: APIRequestContext): Promise<{ id: number; reused: boolean }> {
  const login = await request.post(`${BACKEND_URL}/api/v1/auth/login`, {
    data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() },
  });
  expect(login.status(), 'fixture: login del operador E2E por la API').toBe(200);
  const { token } = (await login.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };
  const url = (path: string) => `${BACKEND_URL}/api/v1${path}`;

  const listed = await request.get(url('/products'), { headers });
  expect(listed.status(), 'fixture: listProducts').toBe(200);
  const existing = ((await listed.json()) as { items: ApiProduct[] }).items
    .filter((p) => p.name === FIXTURE_NAME)
    .sort((a, b) => a.id - b.id)[0];

  let id: number;
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

  const alerts = await request.get(url('/products/alerts'), { headers });
  expect(alerts.status(), 'fixture: listStockAlerts').toBe(200);
  const inAlerts = ((await alerts.json()) as { items: ApiProduct[] }).items.find((p) => p.id === id);
  expect(inAlerts, 'fixture: el producto figura en listStockAlerts (activo, 2 <= 3)').toMatchObject({ id, name: FIXTURE_NAME, currentStock: 2, minStockAlert: 3 });
  return { id, reused: existing !== undefined };
}

test('QA-04.3-E22-33 ESC-33 (panel de alertas tras el login) y ESC-22 (solo consulta: sin "Reponer" ni acciones por fila)', async ({
  page,
  request,
}) => {
  const { id, reused } = await prepareAlertFixture(request);
  const how = reused ? 'reutilizado y reiniciado' : 'creado';
  test.info().annotations.push({ type: 'fixture', description: `producto ${id} ${how}; activo, stock 2, mínimo 3` });
  console.log(`[QA-04.3-E22-33] fixture ${how} en medsupply_test: producto ${id} activo (2/3), "${FIXTURE_NAME}"`);

  // ESC-33: login válido → /dashboard (loginAsE2EOperator lo espera) y el panel de alertas.
  const requests = recordApiRequests(page);
  await loginAsE2EOperator(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: FIXTURE_NAME });
  await expect(row, 'fila del producto en alerta').toBeVisible();
  await expect(row.getByRole('cell', { name: '2', exact: true }), 'stock actual').toBeVisible();
  await expect(row.getByRole('cell', { name: '3', exact: true }), 'stock mínimo').toBeVisible();
  expect(requests, 'el panel lee listStockAlerts y no el catálogo').toContain('GET /api/v1/products/alerts');
  expect(requests).not.toContain('GET /api/v1/products');

  // ESC-22: solo consulta; ninguna acción de V2 ni acción por fila.
  await expect(page.getByRole('button', { name: /reponer/i })).toHaveCount(0);
  await expect(page.getByText(/reponer/i)).toHaveCount(0);
  await expect(page.getByText(/reposici[oó]n/i)).toHaveCount(0);
  await expect(row.getByRole('button'), 'ningún botón en la fila').toHaveCount(0);
  await expect(row.getByRole('link'), 'ningún enlace en la fila').toHaveCount(0);
  await expect(page.getByRole('table').getByRole('button'), 'ningún botón en la tabla').toHaveCount(0);
});
