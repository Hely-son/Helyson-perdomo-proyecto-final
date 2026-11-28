import { test, expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import { BACKEND_URL, E2E_CHAT_CUSTOMER_PHONE, E2E_OPERATOR_EMAIL, e2eOperatorPassword } from './support/e2e-env';
import { loginAsE2EOperator } from './support/session';

// TK-06.4 · ESC-43 (spec 05 §11.4, nivel E, parte INVALID_ORDER_TRANSITION) · DP-02 (spec 04) · D2 (confirmar al cancelar).
// Matriz: docs/qa/TK-06.4-matrix.md. CA-07 y CA-12 (restitución) son TK-06.5.
//
// Datos propios del escenario, creados solo por la API real contra medsupply_test: un producto de nombre único (operador)
// y un pedido hecho por el chat con el cliente E2E del globalSetup. No depende de conteos ni de otros pedidos, no borra
// ni limpia nada. El pedido propio es el más reciente, así que está en la primera página del listado. El token no se imprime.

const WAIT = { timeout: 10_000 };
const API = `${BACKEND_URL}/api/v1`;

type Headers = Record<string, string>;

async function operatorHeaders(request: APIRequestContext): Promise<Headers> {
  const login = await request.post(`${API}/auth/login`, { data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() } });
  expect(login.status(), 'datos: login del operador E2E').toBe(200);
  const { token } = (await login.json()) as { token: string };
  return { Authorization: `Bearer ${token}` };
}

interface ChatReply {
  sessionId: string | null;
  messages: { text: string }[];
}
const textOf = (reply: ChatReply) => reply.messages.map((m) => m.text).join('\n');

/** Producto propio (stock 5) y pedido de 1 unidad confirmado por el chat. */
async function createOwnOrder(request: APIRequestContext, headers: Headers) {
  const name = `QA TK-06.4 ESC-43 ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const created = await request.post(`${API}/products`, {
    headers,
    data: { name, description: null, price: '10.00', currentStock: 5, minStockAlert: 1 },
  });
  expect(created.status(), 'datos: createProduct').toBe(201);
  const { id: productId } = (await created.json()) as { id: number };

  const started = await request.post(`${API}/chat/sessions`, { data: { phone: E2E_CHAT_CUSTOMER_PHONE } });
  expect(started.status(), 'datos: startChatSession').toBe(201);
  const { sessionId } = (await started.json()) as ChatReply;
  const say = async (text: string) => {
    const response = await request.post(`${API}/chat/sessions/${sessionId}/messages`, { data: { text } });
    expect(response.status(), `datos: sendChatMessage("${text}")`).toBe(200);
    return textOf((await response.json()) as ChatReply);
  };

  const catalog = await say('1');
  const line = new RegExp(`^(\\d+)\\) ${name} - `, 'm').exec(catalog);
  expect(line, 'datos: el catálogo del chat lista el producto propio').not.toBeNull();
  await say((line as RegExpExecArray)[1]);
  await say('1'); // cantidad
  await say('3'); // confirmar compra → resumen
  const confirmed = await say('1'); // confirmar pedido
  const orderNumber = /MED-\d{5,}/.exec(confirmed)?.[0];
  expect(orderNumber, 'datos: número del pedido confirmado').toBeDefined();

  const listed = await request.get(`${API}/orders?status=PENDING&pageSize=100`, { headers });
  expect(listed.status(), 'datos: listOrders').toBe(200);
  const own = ((await listed.json()) as { items: { id: number; orderNumber: string }[] }).items.find((o) => o.orderNumber === orderNumber);
  expect(own, 'datos: el pedido propio figura entre los PENDING más recientes').toBeDefined();
  return { orderId: (own as { id: number }).id, orderNumber: orderNumber as string, productId };
}

async function readJson<T>(request: APIRequestContext, path: string, headers: Headers): Promise<T> {
  const response = await request.get(`${API}${path}`, { headers });
  expect(response.status(), `GET ${path}`).toBe(200);
  return (await response.json()) as T;
}

const actions = (page: Page) =>
  page
    .getByRole('dialog')
    .locator('[data-order-action]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-order-action')).sort());

test('QA-06.4-E43 ESC-43: cancelar con un estado obsoleto → confirmación, 409 INVALID_ORDER_TRANSITION, aviso y recarga', async ({
  page,
  request,
}) => {
  const headers = await operatorHeaders(request);
  const { orderId, orderNumber, productId } = await createOwnOrder(request, headers);
  const statusPath = `/api/v1/orders/${orderId}/status`;

  const patches: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH') patches.push(new URL(r.url()).pathname);
  });

  // 1. Abrir el pedido propio desde la tabla: detalle en el Drawer, PENDING con avanzar y cancelar.
  await loginAsE2EOperator(page);
  await page.goto('/dashboard/orders');
  const row = page.getByRole('row').filter({ hasText: new RegExp(`${orderNumber}(?!\\d)`) });
  await expect(row, 'fila del pedido propio').toBeVisible();
  await row.getByRole('button', { name: /ver detalle/i }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText(orderNumber);
  await expect(drawer.locator('[data-order-status="PENDING"]')).toBeVisible();
  await expect.poll(() => actions(page), WAIT).toEqual(['CANCELLED', 'PROCESSING']);

  // 2. El pedido avanza por la API sin que la pantalla lo vea: PENDING → PROCESSING → DISPATCHED.
  for (const status of ['PROCESSING', 'DISPATCHED']) {
    const advanced = await request.patch(`${BACKEND_URL}${statusPath}`, { headers, data: { status } });
    expect(advanced.status(), `cambio externo a ${status}`).toBe(200);
  }
  await expect(drawer.locator('[data-order-status="PENDING"]'), 'la pantalla sigue obsoleta').toBeVisible();

  // 3. D2: cancelar pide confirmación; descartarla no envía nada.
  const cancel = drawer.locator('[data-order-action="CANCELLED"]');
  const confirm = page.getByRole('button', { name: /^sí, cancelar/i });
  await cancel.click();
  await expect(confirm, 'confirmación antes de cancelar').toBeVisible();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(confirm).toBeHidden();
  expect(patches, 'descartar la confirmación no envía el cambio').toEqual([]);

  // 4. Confirmar: 409 y recarga del pedido y del listado.
  await cancel.click();
  await expect(confirm).toBeVisible();
  const at = (method: string, path: string) => (r: Response) => r.request().method() === method && new URL(r.url()).pathname === path;
  const exchange = Promise.all([
    page.waitForResponse(at('PATCH', statusPath), WAIT),
    page.waitForResponse(at('GET', `/api/v1/orders/${orderId}`), WAIT),
    page.waitForResponse(at('GET', '/api/v1/orders'), WAIT),
  ]);
  await confirm.click();
  const [rejected] = await exchange;
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toMatchObject({ error: { code: 'INVALID_ORDER_TRANSITION' } });
  expect(rejected.request().postDataJSON()).toEqual({ status: 'CANCELLED' });

  // 5. Aviso, estado real en detalle y fila, solo la acción válida, sesión activa.
  await expect(page.getByText(/estado[^.]*cambi/i).first(), 'aviso de que el estado cambió').toBeVisible();
  await expect(drawer.locator('[data-order-status="DISPATCHED"]')).toBeVisible();
  await expect.poll(() => actions(page), WAIT).toEqual(['DELIVERED']);
  await expect(row.locator('[data-order-status="DISPATCHED"]')).toHaveCount(1);
  await expect(page).toHaveURL(/\/dashboard\/orders\b/);
  await expect(page.getByRole('button', { name: /iniciar sesión/i }), 'sin redirección a /login').toHaveCount(0);
  expect(patches, 'un solo cambio enviado desde la pantalla').toEqual([statusPath]);

  // El backend es la autoridad: el pedido y el stock no cambiaron por el intento rechazado.
  expect((await readJson<{ status: string }>(request, `/orders/${orderId}`, headers)).status).toBe('DISPATCHED');
  expect((await readJson<{ currentStock: number }>(request, `/products/${productId}`, headers)).currentStock).toBe(4);
});
