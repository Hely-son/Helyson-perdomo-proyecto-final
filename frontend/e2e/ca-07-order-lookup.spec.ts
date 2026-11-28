import { test, expect, type Page } from '@playwright/test';
import {
  E2E_CHAT_CUSTOMER_NATIONAL_PHONE,
  E2E_CHAT_CUSTOMER_PHONE,
  E2E_CHAT_CUSTOMER_TAX_ID,
  E2E_SECOND_CHAT_CUSTOMER_PHONE,
  E2E_SECOND_CHAT_CUSTOMER_TAX_ID,
} from './support/e2e-env';
import { Operator, createChatOrder } from './support/orders';

// TK-06.5 · E2E de CA-07 desde el simulador /chat contra el backend real, sin interceptar la API.
// Escenario: spec 04 ESC-35 (RN-08, D-08) · US-06 crit. 2; crit. 1 solo como control. Matriz: docs/qa/TK-06.5-matrix.md.
// X es el cliente E2E activo; Y, el segundo cliente E2E (D2), ambos del globalSetup. Cada ejecución crea sus productos y
// pedidos. MED-99999999 es la constante aprobada de número inexistente.

const MISSING_ORDER_NUMBER = 'MED-99999999';
const NOT_FOUND = 'Pedido no encontrado';
const LOOKUP_PROMPT = 'Mis pedidos: escribe el número de tu pedido, o 0 para volver al menú.';
const LOOKUP_AGAIN = 'Escribe otro número de pedido, o 0 para volver al menú.';

interface ChatReply {
  sessionId: string | null;
  active: boolean;
  messages: { text: string }[];
}

const botBubbles = (page: Page) => page.getByRole('log', { name: 'Conversación' }).locator('[data-sender="bot"]');

/** Inicia la conversación desde /chat y espera a que se muestren sus mensajes. */
async function startViaUi(page: Page, digits: string): Promise<ChatReply> {
  await page.goto('/chat');
  const phone = page.getByLabel('Teléfono', { exact: true });
  await expect(phone, 'ingreso de teléfono en /chat').toBeVisible();
  const responsePromise = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/chat/sessions',
  );
  await phone.fill(digits);
  await page.getByRole('button', { name: 'Iniciar conversación' }).click();
  const response = await responsePromise;
  expect(response.status(), 'startChatSession del cliente X').toBe(201);
  const reply = (await response.json()) as ChatReply;
  await expect(botBubbles(page)).toHaveCount(reply.messages.length);
  return reply;
}

/** Envía un mensaje desde la pantalla. Devuelve la respuesta real y las burbujas nuevas del bot. */
async function say(page: Page, text: string): Promise<{ body: ChatReply; bubbles: string[] }> {
  const before = await botBubbles(page).count();
  const responsePromise = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /^\/api\/v1\/chat\/sessions\/[^/]+\/messages$/.test(new URL(r.url()).pathname),
  );
  await page.getByRole('textbox', { name: 'Mensaje', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  const response = await responsePromise;
  expect(response.status(), `sendChatMessage("${text}")`).toBe(200);
  const body = (await response.json()) as ChatReply;
  await expect(botBubbles(page)).toHaveCount(before + body.messages.length);
  return { body, bubbles: (await botBubbles(page).allTextContents()).slice(before) };
}

test('QA-06.5-E1 · CA-07 · ESC-35: X ve su pedido en "Mis pedidos"; el de Y responde "Pedido no encontrado", igual que MED-99999999 y sin datos de Y', async ({
  page,
  request,
}) => {
  const operator = await Operator.login(request);
  const ownProduct = await operator.createProduct('CA-07 X', '12.50', 5);
  const foreignProduct = await operator.createProduct('CA-07 Y', '77.70', 5);
  const ownNumber = await createChatOrder(request, E2E_CHAT_CUSTOMER_PHONE, [{ product: ownProduct, quantity: 2 }]);
  const foreignNumber = await createChatOrder(request, E2E_SECOND_CHAT_CUSTOMER_PHONE, [{ product: foreignProduct, quantity: 1 }]);

  // Control: según la API del operador, ambos pedidos existen y son de clientes distintos.
  const own = await operator.findOrder(ownNumber);
  const foreign = await operator.findOrder(foreignNumber);
  expect(own.customer).toMatchObject({ taxId: E2E_CHAT_CUSTOMER_TAX_ID, phone: E2E_CHAT_CUSTOMER_PHONE });
  expect(foreign).toMatchObject({
    orderNumber: foreignNumber,
    status: 'PENDING',
    totalAmount: '77.70',
    customer: { taxId: E2E_SECOND_CHAT_CUSTOMER_TAX_ID, phone: E2E_SECOND_CHAT_CUSTOMER_PHONE },
    items: [{ productId: foreignProduct.id, productName: foreignProduct.name, quantity: 1 }],
  });
  expect(foreign.customer.id).not.toBe(own.customer.id);

  const started = await startViaUi(page, E2E_CHAT_CUSTOMER_NATIONAL_PHONE);
  const menu = await say(page, '2');
  expect(menu.bubbles, 'entra en "Mis pedidos"').toEqual([LOOKUP_PROMPT]);

  // Control (US-06 crit. 1): la búsqueda funciona con el pedido propio.
  const detail = [
    `Pedido ${ownNumber}`,
    'Estado: PENDING',
    `- ${ownProduct.name} × 2 a $12.50 = $25.00`,
    'Total: $25.00',
  ].join('\n');
  const found = await say(page, ownNumber);
  expect(found.body.messages).toEqual([{ text: detail }, { text: LOOKUP_AGAIN }]);
  expect(found.bubbles).toEqual([detail, LOOKUP_AGAIN]);

  // CA-07: el pedido ajeno y el inexistente responden exactamente lo mismo.
  const foreignReply = await say(page, foreignNumber);
  const missingReply = await say(page, MISSING_ORDER_NUMBER);
  const notFoundBody = { sessionId: started.sessionId, active: true, messages: [{ text: NOT_FOUND }] };
  expect(foreignReply.body, 'respuesta al pedido de Y').toEqual(notFoundBody);
  expect(foreignReply.bubbles, 'burbuja del bot ante el pedido de Y').toEqual([NOT_FOUND]);
  expect(missingReply.body, 'respuesta al número inexistente').toEqual(notFoundBody);
  expect(missingReply.bubbles, 'burbuja del bot ante el número inexistente').toEqual([NOT_FOUND]);
  expect(foreignReply.body, 'ajeno e inexistente sin distinción').toEqual(missingReply.body);

  // Ningún dato de Y en nada de lo que dijo el bot (el número que X escribió está en su propia burbuja).
  const botText = (await botBubbles(page).allTextContents()).join('\n');
  expect(botText, 'control: el texto revisado incluye el detalle propio').toContain(detail);
  for (const value of [
    foreignNumber,
    foreignProduct.name,
    foreign.totalAmount,
    foreign.customer.businessName,
    foreign.customer.taxId,
    foreign.customer.phone,
  ]) {
    expect(botText, `el bot no muestra "${value}"`).not.toContain(value);
  }
});
