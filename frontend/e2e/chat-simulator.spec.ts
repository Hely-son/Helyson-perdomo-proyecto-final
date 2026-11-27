import { test, expect, type APIRequestContext, type Page, type Route } from '@playwright/test';
import {
  BACKEND_URL,
  E2E_CHAT_CUSTOMER_NAME,
  E2E_CHAT_CUSTOMER_NATIONAL_PHONE,
  E2E_OPERATOR_EMAIL,
  e2eOperatorPassword,
} from './support/e2e-env';

// TK-05.4 · Simulador de chat en /chat (US-05; spec 03 §3, §4.1, F-1, F-2, §7, §8, ESC-12, DP-05, DP-11; spec 05 §6.3 A y ESC-56).
// Matriz, decisiones de la puerta 1 (D1..D4) y contrato de UI: docs/qa/TK-05.4-matrix.md.
//
// Contrato de UI que fijan estas pruebas (el diseño visual es libre; solo roles, etiquetas y textos accesibles):
//  - Ingreso de teléfono: campo con etiqueta "Teléfono", el prefijo fijo "+56" visible como texto propio y botón "Iniciar conversación".
//  - Conversación: región role="log" con nombre "Conversación"; cada burbuja es un descendiente con data-sender="customer" | "bot",
//    cuyo texto visible (innerText, con sus saltos de línea) es exactamente el texto del mensaje. Campo "Mensaje", botón "Enviar"
//    y botón "Reiniciar conversación" (este último también visible ante SESSION_INVALID).
//  - El sessionId vive solo en estado de React (D1): no se guarda en localStorage, sessionStorage ni cookies.
//  - Las validaciones del teléfono (ESC-56) y los avisos de la API se muestran como texto visible en la pantalla.

const WAIT = { timeout: 10_000 };
/** Texto de ejemplo del contrato para SESSION_INVALID (docs/openapi.yaml; spec 03 DP-05). */
const SESSION_INVALID_MESSAGE = 'La conversación no es válida o expiró. Inicia una nueva conversación.';
/** Mensaje de CH-02 del ejemplo del contrato (teléfono no reconocido). */
const NOT_FOUND_MESSAGE = 'No encontramos tu número. Contacta a la distribuidora para habilitarlo.';
/** Producto de QA exclusivo de este archivo en medsupply_test. Se crea si falta; sus tests no lo modifican ni cambian su stock. */
const PRODUCT_NAME = 'QA TK-05.4 chat fixture';
const SOME_UUID = '3f1c2a9e-8b7d-4c1e-9f0a-2b6d5e4c3a21';

interface ChatReply {
  sessionId: string | null;
  active: boolean;
  messages: { text: string }[];
}

// ---- Selectores del contrato de UI ----
const phoneField = (page: Page) => page.getByLabel('Teléfono', { exact: true });
const startButton = (page: Page) => page.getByRole('button', { name: 'Iniciar conversación' });
const conversation = (page: Page) => page.getByRole('log', { name: 'Conversación' });
const messageField = (page: Page) => page.getByRole('textbox', { name: 'Mensaje', exact: true });
const sendButton = (page: Page) => page.getByRole('button', { name: 'Enviar', exact: true });
const resetButton = (page: Page) => page.getByRole('button', { name: 'Reiniciar conversación' });
const botBubbles = (page: Page) => conversation(page).locator('[data-sender="bot"]');
const customerBubbles = (page: Page) => conversation(page).locator('[data-sender="customer"]');

const botTexts = (page: Page): Promise<string[]> =>
  botBubbles(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).innerText.trim()));

// ---- Red ----
const isStart = (url: URL, method: string) => method === 'POST' && url.pathname === '/api/v1/chat/sessions';
const isMessage = (url: URL, method: string) =>
  method === 'POST' && /^\/api\/v1\/chat\/sessions\/[^/]+\/messages$/.test(url.pathname);

const fulfillJson = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Abre /chat y comprueba que el ingreso de teléfono está a la vista (antes de crear esperas de red; ver support/session.ts). */
async function openChat(page: Page): Promise<void> {
  await page.goto('/chat');
  await expect(phoneField(page), 'ingreso de teléfono en /chat').toBeVisible();
  await expect(startButton(page)).toBeVisible();
}

/** Inicia la conversación por la UI con los nueve dígitos y devuelve el cuerpo de startChatSession. */
async function startViaUi(page: Page, digits: string): Promise<{ reply: ChatReply; sentPhone: unknown }> {
  await openChat(page);
  const responsePromise = page.waitForResponse((r) => isStart(new URL(r.url()), r.request().method()));
  await phoneField(page).fill(digits);
  await startButton(page).click();
  const response = await responsePromise;
  return {
    reply: (await response.json()) as ChatReply,
    sentPhone: (response.request().postDataJSON() as { phone?: unknown }).phone,
  };
}

/** Escribe un mensaje y lo envía con el botón; devuelve la respuesta de sendChatMessage. */
async function send(page: Page, text: string): Promise<{ status: number; body: unknown; url: string }> {
  await expect(messageField(page), 'campo de mensaje de la conversación').toBeVisible();
  const responsePromise = page.waitForResponse((r) => isMessage(new URL(r.url()), r.request().method()));
  await messageField(page).fill(text);
  await sendButton(page).click();
  const response = await responsePromise;
  return { status: response.status(), body: await response.json(), url: response.url() };
}

// ---- Fixture del producto (solo para ESC-12) ----
interface ApiProduct {
  id: number;
  name: string;
}

/** Crea por la API del backend de E2E el producto activo de QA si no existe (nunca lo modifica ni borra). El token no se imprime. */
async function ensureChatProduct(request: APIRequestContext): Promise<void> {
  const login = await request.post(`${BACKEND_URL}/api/v1/auth/login`, {
    data: { email: E2E_OPERATOR_EMAIL, password: e2eOperatorPassword() },
  });
  expect(login.status(), 'fixture: login del operador E2E por la API').toBe(200);
  const { token } = (await login.json()) as { token: string };
  const headers = { Authorization: `Bearer ${token}` };
  const listed = await request.get(`${BACKEND_URL}/api/v1/products`, { headers });
  expect(listed.status(), 'fixture: listProducts').toBe(200);
  const items = ((await listed.json()) as { items: ApiProduct[] }).items;
  if (items.some((p) => p.name === PRODUCT_NAME)) return;
  const created = await request.post(`${BACKEND_URL}/api/v1/products`, {
    headers,
    data: { name: PRODUCT_NAME, description: null, price: '10.00', currentStock: 10, minStockAlert: 1 },
  });
  expect(created.status(), 'fixture: createProduct').toBe(201);
}

// =====================================================================================================================
// ESC-56 (spec 05 §11.7 y §6.3 A; RN-12 interfaz, CL-03 caso válido). Nivel E con intercepción de startChatSession (D3).
// =====================================================================================================================
test.describe('ESC-56 · validación local del teléfono en el simulador', () => {
  const INVALID: { name: string; digits: string; message: RegExp }[] = [
    { name: 'vacía', digits: '', message: /ingres\w*[^.]*n[uú]mero/i },
    { name: '8 dígitos', digits: '94907687', message: /^Falta 1 d[ií]gito\.?$/ },
    { name: '7 dígitos', digits: '9490768', message: /Faltan 2 d[ií]gitos/i },
    { name: '10 dígitos', digits: '9490768765', message: /sobra/i },
  ];

  for (const { name, digits, message } of INVALID) {
    test(`ESC-56 · entrada ${name}: muestra el aviso local y no invoca startChatSession`, async ({ page }) => {
      const starts: unknown[] = [];
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const request = route.request();
          if (isStart(new URL(request.url()), request.method())) starts.push(request.postDataJSON());
          // Si la UI enviara la petición, la respuesta simulada la deja continuar; el conteo de `starts` la delata.
          const reply: ChatReply = { sessionId: SOME_UUID, active: true, messages: [{ text: 'Hola' }] };
          await fulfillJson(route, 201, reply);
        },
      );
      await openChat(page);
      await expect(page.getByText('+56', { exact: true }), 'prefijo fijo +56 visible').toBeVisible();
      await expect(page.getByText(message), 'el aviso no existe antes de intentar continuar').toHaveCount(0);

      if (digits !== '') await phoneField(page).pressSequentially(digits); // tecleo real: respeta cualquier maxlength
      await startButton(page).click();

      await expect(page.getByText(message).first(), `aviso para la entrada ${name}`).toBeVisible();
      // Permanece en el campo de teléfono y no se completa ningún dígito.
      await expect(phoneField(page)).toBeVisible();
      await expect(phoneField(page)).toHaveValue(digits);
      // No se inició la conversación.
      await expect(messageField(page)).toHaveCount(0);
      await page.waitForTimeout(300); // margen para detectar una petición enviada tarde
      expect(starts, 'peticiones a startChatSession').toHaveLength(0);
    });
  }

  test('ESC-56 · entrada de 9 dígitos: invoca startChatSession una sola vez con solo los nueve dígitos (sin +56)', async ({ page }) => {
    const starts: unknown[] = [];
    await page.route(
      (url) => url.pathname === '/api/v1/chat/sessions',
      async (route) => {
        starts.push(route.request().postDataJSON());
        const reply: ChatReply = {
          sessionId: SOME_UUID,
          active: true,
          messages: [{ text: 'Hola, Clínica de prueba. Elige una opción.' }, { text: '1) Catálogo y compra\n2) Mis pedidos' }],
        };
        await fulfillJson(route, 201, reply);
      },
    );
    await openChat(page);
    await expect(page.getByText('+56', { exact: true }), 'prefijo fijo +56 visible').toBeVisible();

    await phoneField(page).pressSequentially('949076876');
    await startButton(page).click();

    // Se permite continuar: aparece la conversación con la respuesta de la API.
    await expect(conversation(page)).toBeVisible();
    await expect(botBubbles(page)).toHaveCount(2);
    await expect(botBubbles(page).first()).toHaveText('Hola, Clínica de prueba. Elige una opción.');
    await expect(messageField(page)).toBeVisible();
    expect(starts, 'una sola petición a startChatSession').toEqual([{ phone: '949076876' }]);
  });
});

// =====================================================================================================================
// ESC-12 (spec 03 §10.2) contra el backend real: reinicio de la conversación.
// =====================================================================================================================
test('ESC-12 · el botón de reinicio crea una sesión nueva en MAIN_MENU con el carrito vacío', async ({ page, request }) => {
  await ensureChatProduct(request);

  // Sesión activa con ítems en el carrito (flujo real del FSM: catálogo → producto → cantidad → carrito).
  const first = await startViaUi(page, E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  expect(first.reply.sessionId, 'startChatSession del cliente E2E del chat (¿lo preparó el globalSetup?)').not.toBeNull();
  expect(first.sentPhone).toBe(E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  await expect(conversation(page)).toBeVisible();

  const catalog = (await send(page, '1')).body as ChatReply;
  const catalogText = catalog.messages.map((m) => m.text).join('\n');
  const productLine = new RegExp(`^(\\d+)\\) ${PRODUCT_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} - `, 'm').exec(catalogText);
  expect(productLine, `el catálogo del chat lista "${PRODUCT_NAME}"`).not.toBeNull();
  await send(page, (productLine as RegExpExecArray)[1]);
  const cart = (await send(page, '2')).body as ChatReply;
  expect(cart.messages.map((m) => m.text).join('\n'), 'el carrito contiene el producto × 2').toContain(`${PRODUCT_NAME} × 2`);
  await expect(customerBubbles(page).last()).toHaveText('2');
  await expect(botBubbles(page).last()).toContainText(`${PRODUCT_NAME} × 2`);

  // Reinicio con el botón, sin volver a escribir el teléfono: nueva startChatSession con los mismos nueve dígitos.
  await expect(resetButton(page)).toBeEnabled();
  const restartPromise = page.waitForResponse((r) => isStart(new URL(r.url()), r.request().method()));
  await resetButton(page).click();
  const restart = await restartPromise;
  expect(restart.status(), 'startChatSession del reinicio').toBe(201);
  expect((restart.request().postDataJSON() as { phone?: unknown }).phone).toBe(E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  const second = (await restart.json()) as ChatReply;
  expect(second.sessionId, 'sesión nueva').not.toBeNull();
  expect(second.sessionId, 'sesión distinta de la anterior').not.toBe(first.reply.sessionId);

  // La conversación empieza de cero: solo el saludo y el menú de la sesión nueva, sin burbujas anteriores.
  const greeting = second.messages.map((m) => m.text);
  await expect.poll(() => botTexts(page), WAIT).toEqual(greeting);
  await expect(customerBubbles(page)).toHaveCount(0);
  expect(greeting.join('\n'), 'el saludo trae el nombre del cliente').toContain(E2E_CHAT_CUSTOMER_NAME);
  expect(greeting.join('\n'), 'MAIN_MENU: menú con 1) y 2)').toMatch(/1\) Cat[aá]logo[\s\S]*2\) Mis pedidos/);

  // El carrito de la sesión nueva está vacío: se comprueba conversando (catálogo → "Ver carrito").
  const catalogSent = await send(page, '1');
  expect(catalogSent.url, 'los mensajes van a la sesión nueva').toContain(second.sessionId as string);
  const catalog2 = catalogSent.body as ChatReply;
  const viewCart = /^(\d+)\) Ver carrito/m.exec(catalog2.messages.map((m) => m.text).join('\n'));
  expect(viewCart, 'el catálogo ofrece "Ver carrito"').not.toBeNull();
  const emptyCart = (await send(page, (viewCart as RegExpExecArray)[1])).body as ChatReply;
  const emptyText = emptyCart.messages.map((m) => m.text).join('\n');
  expect(emptyText, 'carrito vacío en la sesión nueva').toMatch(/vac[ií]o/i);
  expect(emptyText).not.toContain(PRODUCT_NAME);
  await expect(botBubbles(page).last()).toContainText(/vac[ií]o/i);
});

// =====================================================================================================================
// Escenarios propios de la interfaz (TK-05.4 "Hecho cuando"; spec 03 F-1, F-2, §8, DP-05, DP-11). Ver la matriz (QA-05.4-NN).
// =====================================================================================================================

test('QA-05.4-01 · la UI muestra solo lo que devuelve la API: burbujas del bot con los textos exactos y burbuja del cliente', async ({ page }) => {
  const { reply } = await startViaUi(page, E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  expect(reply.sessionId, 'sesión del cliente E2E del chat').not.toBeNull();
  const expected = reply.messages.map((m) => m.text);
  await expect.poll(() => botTexts(page), WAIT).toEqual(expected);
  // Los saltos de línea del menú se conservan (el menú de la API tiene dos líneas).
  expect(expected.some((t) => t.includes('\n'))).toBe(true);

  const sent = await send(page, '1');
  expect(sent.status).toBe(200);
  expected.push(...(sent.body as ChatReply).messages.map((m) => m.text));
  await expect(customerBubbles(page)).toHaveText(['1']);
  await expect.poll(() => botTexts(page), WAIT).toEqual(expected);
  await expect(messageField(page), 'el campo se vacía tras enviar').toHaveValue('');
});

test('QA-05.4-02 · SESSION_INVALID: muestra la respuesta de la API y el botón de reinicio inicia una conversación nueva (DP-05, F-2)', async ({ page }) => {
  let starts = 0;
  await page.route(
    (url) => url.pathname.startsWith('/api/v1/chat/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (isMessage(url, request.method())) {
        await fulfillJson(route, 404, { error: { code: 'SESSION_INVALID', message: SESSION_INVALID_MESSAGE } });
        return;
      }
      if (isStart(url, request.method())) starts += 1;
      await route.continue();
    },
  );
  await startViaUi(page, E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  expect(starts).toBe(1);

  await messageField(page).fill('1');
  await sendButton(page).click();

  await expect(page.getByText(SESSION_INVALID_MESSAGE).first(), 'texto de la API ante SESSION_INVALID').toBeVisible();
  await expect(resetButton(page)).toBeVisible();
  await expect(resetButton(page)).toBeEnabled();

  const restartPromise = page.waitForResponse((r) => isStart(new URL(r.url()), r.request().method()));
  await resetButton(page).click();
  const restart = (await (await restartPromise).json()) as ChatReply;
  expect(starts, 'el reinicio llama otra vez a startChatSession').toBe(2);
  expect(restart.sessionId).not.toBeNull();
  await expect.poll(() => botTexts(page), WAIT).toEqual(restart.messages.map((m) => m.text));
  await expect(messageField(page), 'se puede conversar de nuevo').toBeVisible();
});

test('QA-05.4-03 · una respuesta normal con active:false no cierra la conversación (DP-11)', async ({ page }) => {
  let intercepted = false;
  await page.route(
    (url) => url.pathname.startsWith('/api/v1/chat/sessions/'),
    async (route) => {
      if (!intercepted && isMessage(new URL(route.request().url()), route.request().method())) {
        intercepted = true;
        await fulfillJson(route, 200, { sessionId: SOME_UUID, active: false, messages: [{ text: 'Respuesta simulada con active false' }] });
        return;
      }
      await route.continue();
    },
  );
  await startViaUi(page, E2E_CHAT_CUSTOMER_NATIONAL_PHONE);

  await messageField(page).fill('1');
  await sendButton(page).click();
  await expect(botBubbles(page).last()).toHaveText('Respuesta simulada con active false');
  await expect(messageField(page)).toBeEnabled();
  await expect(sendButton(page)).toBeEnabled();
  await expect(resetButton(page)).toBeVisible();
  expect(intercepted).toBe(true);
});

test('QA-05.4-04 · teléfono no reconocido (sessionId null): muestra el mensaje de la API y no abre la conversación (F-1, CH-02)', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/v1/chat/sessions',
    (route) => fulfillJson(route, 200, { sessionId: null, active: false, messages: [{ text: NOT_FOUND_MESSAGE }] }),
  );
  await openChat(page);
  await phoneField(page).fill('911111111');
  await startButton(page).click();

  await expect(page.getByText(NOT_FOUND_MESSAGE).first()).toBeVisible();
  await expect(messageField(page), 'sin sesión no hay campo de mensaje').toHaveCount(0);
});

test('QA-05.4-05 · D1: el sessionId no se persiste y recargar la página empieza una conversación nueva', async ({ page }) => {
  const { reply } = await startViaUi(page, E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  const sessionId = reply.sessionId;
  expect(sessionId, 'sesión del cliente E2E del chat').not.toBeNull();
  await expect(conversation(page)).toBeVisible();

  const stored = await page.evaluate(() => ({
    local: JSON.stringify({ ...window.localStorage }),
    session: JSON.stringify({ ...window.sessionStorage }),
    cookies: document.cookie,
  }));
  expect(stored.local.includes(sessionId as string), 'sessionId en localStorage').toBe(false);
  expect(stored.session.includes(sessionId as string), 'sessionId en sessionStorage').toBe(false);
  expect(stored.cookies.includes(sessionId as string), 'sessionId en cookies').toBe(false);
  expect((await page.context().cookies()).some((c) => c.value.includes(sessionId as string)), 'sessionId en cookies del contexto').toBe(false);
  expect(page.url().includes(sessionId as string), 'sessionId en la URL').toBe(false);

  await page.reload();
  await expect(phoneField(page), 'tras recargar vuelve al ingreso de teléfono').toBeVisible();
  await expect(messageField(page)).toHaveCount(0);
});

test('QA-05.4-06 · control de seguridad: el texto del bot se muestra como texto, nunca como HTML', async ({ page }) => {
  const hostile = '<img src=x onerror="window.__xss=1"><b>negrita</b>';
  let intercepted = false;
  await page.route(
    (url) => url.pathname.startsWith('/api/v1/chat/sessions/'),
    async (route) => {
      if (!intercepted && isMessage(new URL(route.request().url()), route.request().method())) {
        intercepted = true;
        await fulfillJson(route, 200, { sessionId: SOME_UUID, active: true, messages: [{ text: hostile }] });
        return;
      }
      await route.continue();
    },
  );
  await startViaUi(page, E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  await messageField(page).fill('1');
  await sendButton(page).click();

  await expect(botBubbles(page).last()).toHaveText(hostile); // el texto literal, con las etiquetas visibles
  await expect(conversation(page).locator('img, b')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});
