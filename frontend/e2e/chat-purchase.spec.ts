import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  BACKEND_URL,
  E2E_CHAT_CUSTOMER_NATIONAL_PHONE,
  E2E_INACTIVE_CHAT_CUSTOMER_NATIONAL_PHONE,
  E2E_OPERATOR_EMAIL,
  E2E_UNREGISTERED_NATIONAL_PHONE,
  e2eOperatorPassword,
} from './support/e2e-env';

// TK-05.5 (entrega B) · E2E de compra desde el simulador /chat contra el backend real (sin interceptar las respuestas de la API).
// Escenarios (spec 03): ESC-28 (CA-03), ESC-22 (CA-04, ajustar y descartar), ESC-02 y ESC-03 (CA-06), ESC-30 y ESC-47 (CA-14),
// ESC-31 (CA-15) y ESC-08 (CA-16, CH-11). Matriz: docs/qa/TK-05.5-matrix.md, sección B.
//
// Decisiones de la puerta 1 (2026-11-26):
//  · D1: el webServer del backend corre con CHAT_SESSION_TTL_MINUTES=1 (frontend/playwright.config.ts). Solo ESC-08 espera la
//    expiración real (~65 s); ningún otro escenario lleva esperas fijas. Si el backend conservara el TTL de 30 minutos, ESC-08 falla.
//  · D2: cliente activo QA-E2E-CHAT-01 y cliente INACTIVO QA-E2E-CHAT-02 (ambos del globalSetup); teléfono no registrado fijo.
//  · Cada escenario crea sus propios productos por la API del operador (nombre único con prefijo "QA TK-05.5"); el operador desactiva
//    productos y cambia precios por los endpoints reales (login real). Los E2E no escriben en la base por otra vía.
//  · Los pedidos se comprueban por lo que ve el cliente en el chat (número MED-, estado PENDING, total) y por el stock real de la API
//    del operador (getProduct). La API de pedidos del operador no existe todavía (TK-06).
//
// Contrato de UI (docs/qa/TK-05.4-matrix.md): campo "Teléfono", botón "Iniciar conversación", región role="log" "Conversación" con
// burbujas data-sender="customer" | "bot", campo "Mensaje", botón "Enviar", botón "Reiniciar conversación".

const ORDER_NUMBER = /MED-\d{5,}/;
const SESSION_INVALID_MESSAGE = 'La conversación no es válida o expiró. Inicia una nueva conversación.';
const NOT_FOUND_MESSAGE = 'No encontramos tu número. Contacta a la distribuidora para habilitarlo.';

interface ChatReply {
  sessionId: string | null;
  active: boolean;
  messages: { text: string }[];
}
const textOf = (reply: ChatReply): string => reply.messages.map((m) => m.text).join('\n');

// ---- Selectores del contrato de UI ----
const phoneField = (page: Page) => page.getByLabel('Teléfono', { exact: true });
const startButton = (page: Page) => page.getByRole('button', { name: 'Iniciar conversación' });
const conversation = (page: Page) => page.getByRole('log', { name: 'Conversación' });
const messageField = (page: Page) => page.getByRole('textbox', { name: 'Mensaje', exact: true });
const sendButton = (page: Page) => page.getByRole('button', { name: 'Enviar', exact: true });
const resetButton = (page: Page) => page.getByRole('button', { name: 'Reiniciar conversación' });

const isStart = (url: URL, method: string) => method === 'POST' && url.pathname === '/api/v1/chat/sessions';
const isMessage = (url: URL, method: string) => method === 'POST' && /^\/api\/v1\/chat\/sessions\/[^/]+\/messages$/.test(url.pathname);

/** Abre /chat, escribe los nueve dígitos, inicia la conversación y devuelve la respuesta real de startChatSession. */
async function startViaUi(page: Page, digits: string): Promise<{ status: number; reply: ChatReply }> {
  await page.goto('/chat');
  await expect(phoneField(page), 'ingreso de teléfono en /chat').toBeVisible();
  const responsePromise = page.waitForResponse((r) => isStart(new URL(r.url()), r.request().method()));
  await phoneField(page).fill(digits);
  await startButton(page).click();
  const response = await responsePromise;
  return { status: response.status(), reply: (await response.json()) as ChatReply };
}

/** Escribe un mensaje con el campo y el botón de la UI y devuelve la respuesta real de sendChatMessage. */
async function say(page: Page, text: string): Promise<{ status: number; body: ChatReply; text: string }> {
  await expect(messageField(page), 'campo de mensaje de la conversación').toBeVisible();
  const responsePromise = page.waitForResponse((r) => isMessage(new URL(r.url()), r.request().method()));
  await messageField(page).fill(text);
  await sendButton(page).click();
  const response = await responsePromise;
  const body = (await response.json()) as ChatReply;
  return { status: response.status(), body, text: response.ok() ? textOf(body) : JSON.stringify(body) };
}

/** Como `say`, exigiendo 200 (respuesta normal del bot). */
async function ok(page: Page, text: string): Promise<string> {
  const reply = await say(page, text);
  expect(reply.status, `sendChatMessage("${text}")`).toBe(200);
  return reply.text;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Número de la línea del producto en el texto del catálogo ("N) Nombre - $precio"). */
function catalogNumber(catalog: string, name: string): string {
  const m = new RegExp(`^(\\d+)\\) ${escapeRegExp(name)} - `, 'm').exec(catalog);
  if (!m) throw new Error(`el catálogo del chat no lista "${name}":\n${catalog}`);
  return m[1];
}

/** Desde MAIN_MENU o CART: abre el catálogo, elige el producto por el número mostrado e indica la cantidad. Devuelve la respuesta del carrito. */
async function addToCart(page: Page, name: string, quantity: number): Promise<string> {
  const catalog = await ok(page, '1');
  await ok(page, catalogNumber(catalog, name));
  return ok(page, String(quantity));
}

/** En CART con líneas: `3` (Confirmar compra) muestra el resumen. */
async function showSummary(page: Page): Promise<string> {
  const summary = await ok(page, '3');
  expect(summary, 'resumen con la opción de confirmar').toMatch(/^1\) Confirmar pedido$/m);
  return summary;
}

/** Desde MAIN_MENU: catálogo → "Ver carrito". Devuelve el texto del carrito. */
async function viewCartFromMenu(page: Page): Promise<string> {
  const catalog = await ok(page, '1');
  const viewCart = /^(\d+)\) Ver carrito/m.exec(catalog);
  expect(viewCart, 'el catálogo ofrece "Ver carrito"').not.toBeNull();
  return ok(page, (viewCart as RegExpExecArray)[1]);
}

// ---- API del operador (productos por los endpoints reales) ----
interface Product {
  id: number;
  name: string;
  price: string;
  currentStock: number;
  isActive: boolean;
}

class Operator {
  constructor(
    private readonly request: APIRequestContext,
    private readonly headers: Record<string, string>,
  ) {}

  static async login(request: APIRequestContext): Promise<Operator> {
    const login = await request.post(`${BACKEND_URL}/api/v1/auth/login`, {
      data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() },
    });
    expect(login.status(), 'login del operador E2E por la API').toBe(200);
    const { token } = (await login.json()) as { token: string };
    return new Operator(request, { Authorization: `Bearer ${token}` });
  }

  async createProduct(tag: string, price: string, stock: number): Promise<Product> {
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const created = await this.request.post(`${BACKEND_URL}/api/v1/products`, {
      headers: this.headers,
      data: { name: `QA TK-05.5 ${tag} ${unique}`, description: null, price, currentStock: stock, minStockAlert: 1 },
    });
    expect(created.status(), 'createProduct').toBe(201);
    return (await created.json()) as Product;
  }

  async deactivate(product: Product): Promise<void> {
    const res = await this.request.post(`${BACKEND_URL}/api/v1/products/${product.id}/deactivate`, { headers: this.headers });
    expect(res.status(), 'deactivateProduct').toBe(200);
  }

  async setPrice(product: Product, price: string): Promise<void> {
    const res = await this.request.patch(`${BACKEND_URL}/api/v1/products/${product.id}`, { headers: this.headers, data: { price } });
    expect(res.status(), 'updateProduct (precio)').toBe(200);
  }

  async stock(product: Product): Promise<number> {
    const res = await this.request.get(`${BACKEND_URL}/api/v1/products/${product.id}`, { headers: this.headers });
    expect(res.status(), 'getProduct').toBe(200);
    return ((await res.json()) as Product).currentStock;
  }
}

/** Inicia la conversación del cliente E2E activo y comprueba que hay sesión (MAIN_MENU). */
async function startActiveCustomer(page: Page): Promise<ChatReply> {
  const { status, reply } = await startViaUi(page, E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  expect(status, 'startChatSession del cliente E2E activo (¿lo preparó el globalSetup?)').toBe(201);
  expect(reply.sessionId).not.toBeNull();
  await expect(conversation(page)).toBeVisible();
  return reply;
}

// =====================================================================================================================
// CA-03 · ESC-28
// =====================================================================================================================
test('ESC-28 · CA-03 · A × 2 y B × 1: el resumen no crea pedido; `1` responde con número MED- y PENDING; el stock baja en 2 y 1; carrito vacío y MAIN_MENU', async ({ page, request }) => {
  const operator = await Operator.login(request);
  const a = await operator.createProduct('ESC-28 A', '100.00', 10);
  const b = await operator.createProduct('ESC-28 B', '50.00', 5);
  await startActiveCustomer(page);

  await addToCart(page, a.name, 2);
  const cart = await addToCart(page, b.name, 1);
  expect(cart).toContain(`${a.name} × 2`);
  expect(cart).toContain(`${b.name} × 1`);
  const summary = await showSummary(page);
  expect(summary).toContain(`${a.name} × 2 = $200.00`);
  expect(summary).toContain(`${b.name} × 1 = $50.00`);
  expect(summary).toContain('Total: $250.00');
  expect([await operator.stock(a), await operator.stock(b)], 'el resumen no descuenta stock').toEqual([10, 5]);

  const confirmed = await ok(page, '1');
  expect(confirmed).toMatch(ORDER_NUMBER);
  expect(confirmed).toContain('PENDING');
  expect(confirmed).toContain('Total: $250.00');
  expect(confirmed, 'vuelve al menú principal').toMatch(/1\) Cat[aá]logo[\s\S]*2\) Mis pedidos/);
  await expect(conversation(page)).toContainText(ORDER_NUMBER);
  expect([await operator.stock(a), await operator.stock(b)], 'stock de A y B baja en 2 y 1').toEqual([8, 4]);

  // MAIN_MENU con carrito vacío: la opción `1` abre el catálogo y el carrito está vacío.
  expect(await viewCartFromMenu(page)).toMatch(/vac[ií]o/i);
});

// =====================================================================================================================
// CA-04 · ESC-22
// =====================================================================================================================
test.describe('ESC-22 · CA-04 · cantidad mayor que el stock', () => {
  test('ESC-22 ajustar · A con stock 5, pedir 8: ofrece ajustar a 5 o descartar; `1` deja A × 5 en el carrito', async ({ page, request }) => {
    const operator = await Operator.login(request);
    const a = await operator.createProduct('ESC-22 ajustar', '100.00', 5);
    await startActiveCustomer(page);

    const catalog = await ok(page, '1');
    await ok(page, catalogNumber(catalog, a.name));
    const offer = await ok(page, '8');
    expect(offer).toContain('1) Ajustar a 5 unidades');
    expect(offer).toMatch(/^2\) Descartar/m);
    await expect(conversation(page)).toContainText('1) Ajustar a 5 unidades');

    const cart = await ok(page, '1');
    expect(cart).toContain(`${a.name} × 5`);
    await expect(conversation(page)).toContainText(`${a.name} × 5`);
  });

  test('ESC-22 descartar · A con stock 5, pedir 8: `2` quita A y vuelve al catálogo; el carrito no tiene A', async ({ page, request }) => {
    const operator = await Operator.login(request);
    const a = await operator.createProduct('ESC-22 descartar', '100.00', 5);
    await startActiveCustomer(page);

    const catalog = await ok(page, '1');
    await ok(page, catalogNumber(catalog, a.name));
    const offer = await ok(page, '8');
    expect(offer).toMatch(/^2\) Descartar/m);

    const back = await ok(page, '2');
    expect(back, 'vuelve al catálogo').toContain('Catálogo de productos:');
    const viewCart = /^(\d+)\) Ver carrito/m.exec(back);
    expect(viewCart).not.toBeNull();
    const cart = await ok(page, (viewCart as RegExpExecArray)[1]);
    expect(cart).toMatch(/vac[ií]o/i);
    expect(cart).not.toContain(a.name);
  });
});

// =====================================================================================================================
// CA-06 · ESC-02 y ESC-03
// =====================================================================================================================
test.describe('CA-06 · teléfono no habilitado', () => {
  test('ESC-02 · teléfono sin cliente (+56 9 0000 0000): sin sesión, mensaje de contacto y sin menú', async ({ page }) => {
    const { reply } = await startViaUi(page, E2E_UNREGISTERED_NATIONAL_PHONE);
    expect(reply.sessionId, 'no se crea sesión').toBeNull();
    expect(reply.active).toBe(false);
    expect(textOf(reply)).toBe(NOT_FOUND_MESSAGE);
    await expect(page.getByText(NOT_FOUND_MESSAGE).first()).toBeVisible();
    await expect(messageField(page), 'sin sesión no hay conversación ni menú').toHaveCount(0);
    await expect(page.getByText(/Mis pedidos/)).toHaveCount(0);
  });

  test('ESC-03 · cliente inactivo (QA-E2E-CHAT-02): igual que ESC-02', async ({ page }) => {
    const { reply } = await startViaUi(page, E2E_INACTIVE_CHAT_CUSTOMER_NATIONAL_PHONE);
    expect(reply.sessionId, 'no se crea sesión para un cliente inactivo (¿lo preparó el globalSetup?)').toBeNull();
    expect(reply.active).toBe(false);
    expect(textOf(reply)).toBe(NOT_FOUND_MESSAGE);
    await expect(page.getByText(NOT_FOUND_MESSAGE).first()).toBeVisible();
    await expect(messageField(page)).toHaveCount(0);
    await expect(page.getByText(/Mis pedidos/)).toHaveCount(0);
  });
});

// =====================================================================================================================
// CA-14 · ESC-30 y ESC-47
// =====================================================================================================================
test('ESC-30 · CA-14 · A y B; el operador desactiva B tras el resumen: `1` informa, retira B y muestra un resumen solo con A sin cambiar stock; la segunda `1` crea el pedido solo con A', async ({ page, request }) => {
  const operator = await Operator.login(request);
  const a = await operator.createProduct('ESC-30 A', '100.00', 10);
  const b = await operator.createProduct('ESC-30 B', '50.00', 5);
  await startActiveCustomer(page);
  await addToCart(page, a.name, 1);
  await addToCart(page, b.name, 2);
  const summary = await showSummary(page);
  expect(summary).toContain('Total: $200.00');
  await operator.deactivate(b);

  const first = await ok(page, '1');
  expect(first).not.toMatch(ORDER_NUMBER);
  expect(first, 'informa que B ya no está disponible y lo retira').toContain(`${b.name} ya no está disponible y se retiró de tu carrito.`);
  const newSummary = first.slice(first.indexOf('Resumen de tu pedido:'));
  expect(newSummary, 'nuevo resumen solo con A').toContain(`${a.name} × 1 = $100.00`);
  expect(newSummary).toContain('Total: $100.00');
  expect(newSummary).not.toContain(b.name);
  expect([await operator.stock(a), await operator.stock(b)], 'el rechazo no cambia el stock').toEqual([10, 5]);

  const second = await ok(page, '1');
  expect(second).toMatch(ORDER_NUMBER);
  expect(second).toContain('PENDING');
  expect(second).toContain('Total: $100.00');
  expect([await operator.stock(a), await operator.stock(b)], 'pedido solo con A').toEqual([9, 5]);
});

test('ESC-47 · CA-14 · carrito con solo B; el operador desactiva B tras el resumen: `1` informa, no crea pedido, deja el carrito vacío en CART', async ({ page, request }) => {
  const operator = await Operator.login(request);
  const b = await operator.createProduct('ESC-47 B', '50.00', 5);
  await startActiveCustomer(page);
  await addToCart(page, b.name, 1);
  await showSummary(page);
  await operator.deactivate(b);

  const reply = await ok(page, '1');
  expect(reply).not.toMatch(ORDER_NUMBER);
  expect(reply).toContain(`${b.name} ya no está disponible y se retiró de tu carrito.`);
  expect(reply, 'carrito vacío en el estado CART').toMatch(/Tu carrito está vac[ií]o\.\n1\) Agregar un producto/);
  await expect(conversation(page)).toContainText('Tu carrito está vacío.');
  expect(await operator.stock(b), 'el rechazo no cambia el stock').toBe(5);
});

// =====================================================================================================================
// CA-15 · ESC-31
// =====================================================================================================================
test('ESC-31 · CA-15 · resumen con A a 100.00; el operador cambia A a 120.00: `1` no crea pedido ni cambia stock y muestra 120.00; la segunda `1` crea el pedido a 120.00', async ({ page, request }) => {
  const operator = await Operator.login(request);
  const a = await operator.createProduct('ESC-31 A', '100.00', 10);
  await startActiveCustomer(page);
  await addToCart(page, a.name, 2);
  const summary = await showSummary(page);
  expect(summary).toContain(`${a.name} × 2 = $200.00`);
  await operator.setPrice(a, '120.00');

  const first = await ok(page, '1');
  expect(first).not.toMatch(ORDER_NUMBER);
  expect(first, 'nuevo resumen con el precio vigente').toContain(`${a.name} × 2 = $240.00`);
  expect(first).toContain('Total: $240.00');
  expect(first).toMatch(/^1\) Confirmar pedido$/m);
  expect(await operator.stock(a), 'el rechazo no cambia el stock').toBe(10);

  const second = await ok(page, '1');
  expect(second).toMatch(ORDER_NUMBER);
  expect(second).toContain('PENDING');
  expect(second, 'pedido al precio vigente (120.00 × 2)').toContain('Total: $240.00');
  expect(await operator.stock(a)).toBe(8);
});

// =====================================================================================================================
// CA-16 · ESC-08 (único escenario con espera real: TTL de 1 minuto, D1)
// =====================================================================================================================
test('ESC-08 · CA-16 · sesión con 1 ítem y TTL corto: pasado el TTL, el mensaje y el siguiente dan SESSION_INVALID; una sesión nueva del mismo teléfono empieza con carrito vacío', async ({ page, request }) => {
  test.setTimeout(180_000);
  const operator = await Operator.login(request);
  const a = await operator.createProduct('ESC-08 A', '100.00', 10);
  const started = await startActiveCustomer(page);
  const sessionId = started.sessionId as string;

  const cart = await addToCart(page, a.name, 1);
  expect(cart, 'control previo: la sesión está vigente y tiene 1 ítem').toContain(`${a.name} × 1`);

  // Inactividad estrictamente mayor que el TTL de 1 minuto (D1). Si CHAT_SESSION_TTL_MINUTES=1 no llegó al backend (TTL de 30 minutos),
  // la sesión seguirá vigente y el estado 404 de abajo no se cumplirá: la prueba falla.
  await page.waitForTimeout(65_000);

  const first = await say(page, '1');
  expect(first.status, 'tras 65 s de inactividad el mensaje debe dar 404: ¿llegó CHAT_SESSION_TTL_MINUTES=1 al backend?').toBe(404);
  expect(first.body).toEqual({ error: { code: 'SESSION_INVALID', message: SESSION_INVALID_MESSAGE } });
  await expect(page.getByText(SESSION_INVALID_MESSAGE).first(), 'la UI muestra el texto de la API').toBeVisible();
  await expect(resetButton(page)).toBeVisible();

  // Segundo mensaje a la misma sesión (la UI ya la dio por inválida: se envía directamente a la API real).
  const second = await request.post(`${BACKEND_URL}/api/v1/chat/sessions/${sessionId}/messages`, { data: { text: '0' } });
  expect(second.status()).toBe(404);
  expect(await second.json()).toEqual({ error: { code: 'SESSION_INVALID', message: SESSION_INVALID_MESSAGE } });

  // Sesión nueva del mismo teléfono (botón de reinicio): MAIN_MENU con carrito vacío.
  const restartPromise = page.waitForResponse((r) => isStart(new URL(r.url()), r.request().method()));
  await resetButton(page).click();
  const restart = await restartPromise;
  expect(restart.status()).toBe(201);
  const fresh = (await restart.json()) as ChatReply;
  expect(fresh.sessionId).not.toBeNull();
  expect(fresh.sessionId).not.toBe(sessionId);
  const freshCart = await viewCartFromMenu(page);
  expect(freshCart).toMatch(/vac[ií]o/i);
  expect(freshCart).not.toContain(a.name);
});
