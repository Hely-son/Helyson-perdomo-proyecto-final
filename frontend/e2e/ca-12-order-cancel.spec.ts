import { test, expect, type Page } from '@playwright/test';
import { E2E_CHAT_CUSTOMER_PHONE } from './support/e2e-env';
import { Operator, createChatOrder } from './support/orders';
import { loginAsE2EOperator } from './support/session';

// TK-06.5 · E2E de la cancelación por el operador desde PROCESSING en el dashboard, contra el backend real.
// Escenario: spec 04 ESC-23 (RN-05) · CA-12 (a) solo desde PROCESSING · US-06 crit. 5. Matriz: docs/qa/TK-06.5-matrix.md.
// D1: en lugar del "pedido PROCESSING del seed" de ESC-23, un pedido propio (A × 2 y B × 1 sobre productos propios con
// stock 5), creado por el chat y avanzado por la API en cada ejecución. El pedido es el más reciente, así que está en la
// primera página del listado sin filtro, donde la fila sigue visible después de cancelar.

const WAIT = { timeout: 10_000 };

const actions = (page: Page) =>
  page
    .getByRole('dialog')
    .locator('[data-order-action]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-order-action')).sort());

test('QA-06.5-E2 · CA-12 (a) · ESC-23: cancelar desde el dashboard un pedido PROCESSING lo deja CANCELLED y restituye el stock de cada ítem', async ({
  page,
  request,
}) => {
  const operator = await Operator.login(request);
  const a = await operator.createProduct('CA-12 A', '100.00', 5);
  const b = await operator.createProduct('CA-12 B', '50.00', 5);
  const orderNumber = await createChatOrder(request, E2E_CHAT_CUSTOMER_PHONE, [
    { product: a, quantity: 2 },
    { product: b, quantity: 1 },
  ]);
  const created = await operator.findOrder(orderNumber);
  expect(created.items, 'datos: ítems del pedido propio').toHaveLength(2);
  expect(created.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ productId: a.id, quantity: 2 }),
      expect.objectContaining({ productId: b.id, quantity: 1 }),
    ]),
  );
  const orderId = created.id;
  const statusPath = `/api/v1/orders/${orderId}/status`;

  const advanced = await operator.changeStatus(orderId, 'PROCESSING');
  expect(advanced.status(), 'datos: PENDING → PROCESSING').toBe(200);
  expect((await operator.order(orderId)).status).toBe('PROCESSING');
  expect(await operator.stocks(a, b), 'stock antes de cancelar').toEqual([3, 4]);

  // Todos los PATCH que envíe la pantalla, desde antes de abrirla.
  const patches: { path: string; body: unknown }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH') patches.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
  });

  await loginAsE2EOperator(page);
  await page.goto('/dashboard/orders');
  const row = page.getByRole('row').filter({ hasText: new RegExp(`${orderNumber}(?!\\d)`) });
  await expect(row.locator('[data-order-status="PROCESSING"]'), 'fila del pedido propio en PROCESSING').toBeVisible();
  await row.getByRole('button', { name: /ver detalle/i }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText(orderNumber);
  await expect(drawer.locator('[data-order-status="PROCESSING"]')).toBeVisible();
  await expect.poll(() => actions(page), WAIT).toEqual(['CANCELLED', 'DISPATCHED']);

  // Cancelar y confirmar.
  await drawer.locator('[data-order-action="CANCELLED"]').click();
  const confirm = page.getByRole('button', { name: /^sí, cancelar/i });
  await expect(confirm, 'confirmación antes de cancelar').toBeVisible();
  expect(patches, 'nada se envía antes de confirmar').toEqual([]);
  const responsePromise = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === statusPath,
    WAIT,
  );
  await confirm.click();
  const response = await responsePromise;
  expect(response.status(), 'PATCH de cancelación').toBe(200);
  expect(response.request().postDataJSON()).toEqual({ status: 'CANCELLED' });
  expect(await response.json()).toMatchObject({ id: orderId, orderNumber, status: 'CANCELLED' });
  await expect(page.getByText('Pedido actualizado')).toBeVisible();

  /** Detalle y fila en CANCELLED, sin acciones disponibles. */
  const expectCancelledOnScreen = async (moment: string) => {
    await expect(drawer, moment).toContainText(orderNumber);
    await expect(drawer.locator('[data-order-status="CANCELLED"]'), `${moment}: detalle CANCELLED`).toBeVisible();
    await expect(drawer.locator('[data-order-status]')).toHaveCount(1);
    await expect(drawer.getByText('Este pedido no admite más cambios.'), moment).toBeVisible();
    await expect(drawer.locator('[data-order-action]'), `${moment}: sin acciones`).toHaveCount(0);
    await expect(row.locator('[data-order-status="CANCELLED"]'), `${moment}: fila CANCELLED`).toHaveCount(1);
    await expect(row.locator('[data-order-status]')).toHaveCount(1);
  };

  /** La API es la fuente de verdad: estado CANCELLED y cada ítem restituido en su cantidad. */
  const expectCancelledAndRestocked = async (moment: string) => {
    expect((await operator.order(orderId)).status, moment).toBe('CANCELLED');
    expect(await operator.stocks(a, b), `${moment}: stock restituido (3 + 2 y 4 + 1)`).toEqual([5, 5]);
  };

  await expectCancelledOnScreen('tras confirmar');
  await expectCancelledAndRestocked('tras confirmar');

  await page.reload();
  await expectCancelledOnScreen('tras recargar');
  await expectCancelledAndRestocked('tras recargar');

  expect(patches, 'un único PATCH en todo el recorrido').toEqual([{ path: statusPath, body: { status: 'CANCELLED' } }]);
});
