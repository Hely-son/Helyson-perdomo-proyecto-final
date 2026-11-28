import type { PrismaClient } from '../../../src/generated/prisma/client';
import { handleChatMessage } from '../../../src/modules/chat/chat-fsm';
import { createOrderService } from '../../../src/modules/orders/orders.service';
import { createFakeProducts, PRODUCT_A } from '../../helpers/chat-products';

// TK-06.3 · Pruebas de aceptación de QA (fase 1): "Mis pedidos" en el chat (unidad, sin red ni base de datos).
// Spec 03 §4.2 (ORDER_LOOKUP y reglas comunes), D-11, D-12, DP-10, F-8, §10.6: ESC-39, ESC-40 (CA-07, RN-08), ESC-41 y ESC-42.
// La integración contra PostgreSQL (spec 03 ESC-39/ESC-40, spec 04 ESC-35/ESC-36 y el carácter nulo) está en tests/db/chat-order-lookup.test.ts.
// Decisiones de la puerta 1:
//   D1 cada ítem se identifica con el nombre ACTUAL del producto.
//   D2 pedido encontrado = un mensaje (número, estado literal, líneas `nombre × cantidad` con precio guardado y subtotal, y total; importes
//      `$` con dos decimales; ordenadas por productId) y un segundo mensaje que invita a escribir otro número o `0`. No encontrado:
//      "Pedido no encontrado" (literal del PRD).
//   D3 el FSM recorta y pasa a mayúsculas; lo que no cumple ^MED-\d{5,}$ no consulta PostgreSQL (la guarda vive en el servicio).
//   D4 deps.orders.findCustomerOrder(customerId, orderNumber) -> pedido | null; el ajeno es indistinguible del inexistente.
// Interfaz asumida del resultado: { orderNumber, status, totalAmount, items: [{ productId, productName, quantity, unitPrice, subtotal }] }
// (importes como string de dos decimales; el simulado entrega los ítems ya ordenados por productId: el orden se verifica en integración).
// Textos libres salvo los citados. Matriz: docs/qa/TK-06.3-matrix.md

interface FoundOrder {
  orderNumber: string;
  status: 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  totalAmount: string;
  items: { productId: number; productName: string; quantity: number; unitPrice: string; subtotal: string }[];
}

type Session = Parameters<typeof handleChatMessage>[0];
type Handle = (session: Session, text: string, deps: { products: unknown; orders: unknown }) => Promise<string[]>;
const handle = handleChatMessage as unknown as Handle;

const CUSTOMER_ID = 77;
const OTHER_CUSTOMER_ID = 88;
const NOT_FOUND = 'Pedido no encontrado';

const NAME_A = 'Alcohol gel QA';
const NAME_B = 'Bata desechable QA';
const NAME_FOREIGN = 'Casco ajeno QA';

/** Pedido propio MED-00042 en PROCESSING: A × 2 a 100.00 y B × 3 a 50.50; total 351.50. */
const OWN_ORDER: FoundOrder = {
  orderNumber: 'MED-00042',
  status: 'PROCESSING',
  totalAmount: '351.50',
  items: [
    { productId: 201, productName: NAME_A, quantity: 2, unitPrice: '100.00', subtotal: '200.00' },
    { productId: 202, productName: NAME_B, quantity: 3, unitPrice: '50.50', subtotal: '151.50' },
  ],
};

/** Pedido MED-00043 de otro cliente. */
const FOREIGN_ORDER: FoundOrder = {
  orderNumber: 'MED-00043',
  status: 'DELIVERED',
  totalAmount: '480.00',
  items: [{ productId: 203, productName: NAME_FOREIGN, quantity: 4, unitPrice: '120.00', subtotal: '480.00' }],
};

/** Servicio de pedidos simulado: coincidencia EXACTA de cliente y número (no normaliza: eso es tarea del FSM, DP-10). */
function createFakeLookup() {
  const stored = [
    { customerId: CUSTOMER_ID, order: OWN_ORDER },
    { customerId: OTHER_CUSTOMER_ID, order: FOREIGN_ORDER },
  ];
  const calls: [number, string][] = [];
  const confirmations: unknown[] = [];
  const service = {
    async findCustomerOrder(customerId: number, orderNumber: string): Promise<FoundOrder | null> {
      calls.push([customerId, orderNumber]);
      const hit = stored.find((s) => s.customerId === customerId && s.order.orderNumber === orderNumber);
      return hit ? structuredClone(hit.order) : null;
    },
    async confirmOrder(input: unknown): Promise<never> {
      confirmations.push(input);
      throw new Error('"Mis pedidos" no debe confirmar pedidos');
    },
  };
  return { service, calls, confirmations };
}

const products = createFakeProducts([PRODUCT_A]).service;
const CART = [{ productId: PRODUCT_A.id, quantity: 2 }];

const makeSession = (state: string): Session =>
  ({ customerId: CUSTOMER_ID, state, cart: structuredClone(CART) }) as unknown as Session;

async function send(session: Session, text: string, orders: unknown): Promise<string[]> {
  const messages = await handle(session, text, { products, orders });
  expect(Array.isArray(messages)).toBe(true);
  expect(messages.length).toBeGreaterThanOrEqual(1);
  for (const m of messages) {
    expect(typeof m).toBe('string');
    expect(m.trim().length).toBeGreaterThan(0);
  }
  return messages;
}

/** Texto desde el comienzo de la línea de `from` hasta el comienzo de la línea de `to` (o el final). */
function block(text: string, from: string, to?: string): string {
  const startOfLine = (needle: string): number => text.lastIndexOf('\n', text.indexOf(needle)) + 1;
  expect(text).toContain(from);
  return text.slice(startOfLine(from), to === undefined ? undefined : startOfLine(to));
}

/** D2: dos mensajes; el primero con número, estado, líneas y total; el segundo invita a otro número o `0`. */
function expectOwnOrderShown(messages: string[]): void {
  expect(messages).toHaveLength(2);
  const [detail, invitation] = messages;
  expect(detail).toContain('MED-00042');
  expect(detail).toContain('PROCESSING');
  const lineA = block(detail, NAME_A, NAME_B);
  expect(lineA).toMatch(/[×x]\s*2(?!\d|[.,]\d)/);
  expect(lineA).toContain('$100.00');
  expect(lineA).toContain('$200.00');
  const lineB = block(detail, NAME_B);
  expect(lineB).toMatch(/[×x]\s*3(?!\d|[.,]\d)/);
  expect(lineB).toContain('$50.50');
  expect(lineB).toContain('$151.50');
  expect(detail.split('\n').some((l) => /\btotal\b/i.test(l) && l.includes('$351.50'))).toBe(true);
  expect(invitation).toMatch(/n[uú]mero|pedido|orden/i);
  expect(invitation).toMatch(/(?<![\w$.,-])0(?!\w|[.,]\d)/);
}

/** Sustituye el número consultado para comparar respuestas de dos números distintos (D-12). */
const masked = (messages: string[], orderNumber: string): string[] => messages.map((m) => m.split(orderNumber).join('#'));

function expectNotFound(messages: string[]): void {
  const text = messages.join('\n');
  expect(text).toContain(NOT_FOUND);
  for (const leaked of ['PROCESSING', 'DELIVERED', NAME_A, NAME_B, NAME_FOREIGN, '351.50', '480.00']) {
    expect(text).not.toContain(leaked);
  }
}

describe('TK-06.3 · spec 03 ESC-39 · pedido propio en "Mis pedidos" (CH-08 MVP, US-06 crit. 1)', () => {
  test('spec 03 ESC-39 · `2` en el menú pide un número; `MED-00042` muestra número, PROCESSING, ítems y total, sin reclamos ni cancelación; sigue en ORDER_LOOKUP', async () => {
    const orders = createFakeLookup();
    const session = makeSession('MAIN_MENU');

    const prompt = (await send(session, '2', orders.service)).join('\n');
    expect(session.state).toBe('ORDER_LOOKUP');
    expect(prompt).toMatch(/n[uú]mero/i);
    expect(prompt).not.toMatch(/pr[oó]ximamente/i);

    const messages = await send(session, 'MED-00042', orders.service);

    expectOwnOrderShown(messages);
    expect(messages.join('\n')).not.toMatch(/reclam|cancel|anular/i); // CH-08 y CH-09 son V2
    expect(session.state).toBe('ORDER_LOOKUP'); // D-11
    expect(session.cart).toEqual(CART);
    expect(orders.calls).toEqual([[CUSTOMER_ID, 'MED-00042']]); // RN-08: con el cliente de la sesión
    expect(orders.confirmations).toEqual([]);
  });
});

describe('TK-06.3 · spec 03 ESC-40 · pedido de otro cliente (RN-08, CA-07, US-06 crit. 2)', () => {
  test('spec 03 ESC-40 · CA-07 · `MED-00043` (ajeno) responde "Pedido no encontrado", sin datos del pedido, igual que un número inexistente; sigue en ORDER_LOOKUP', async () => {
    const orders = createFakeLookup();
    const session = makeSession('ORDER_LOOKUP');

    const foreign = await send(session, 'MED-00043', orders.service);

    expectNotFound(foreign);
    expect(session.state).toBe('ORDER_LOOKUP');
    expect(session.cart).toEqual(CART);
    expect(orders.calls).toEqual([[CUSTOMER_ID, 'MED-00043']]);

    const missing = await send(session, 'MED-99999', orders.service);
    expect(masked(foreign, 'MED-00043')).toEqual(masked(missing, 'MED-99999')); // D-12
  });
});

describe('TK-06.3 · spec 03 ESC-41 · normalización y número completo (RN-08, D-12, DP-10)', () => {
  test('spec 03 ESC-41 · ` med-00042 ` (espacios y minúsculas) muestra el pedido propio: se consulta `MED-00042`', async () => {
    const orders = createFakeLookup();
    const session = makeSession('ORDER_LOOKUP');

    const messages = await send(session, ' med-00042 ', orders.service);

    expectOwnOrderShown(messages);
    expect(orders.calls).toEqual([[CUSTOMER_ID, 'MED-00042']]);
    expect(session.state).toBe('ORDER_LOOKUP');
  });

  test.each(['42', 'MED-99999', 'hola'])(
    'spec 03 ESC-41 · %j responde "Pedido no encontrado" y sigue en ORDER_LOOKUP',
    async (input) => {
      const orders = createFakeLookup();
      const session = makeSession('ORDER_LOOKUP');

      expectNotFound(await send(session, input, orders.service));
      expect(session.state).toBe('ORDER_LOOKUP');
      expect(session.cart).toEqual(CART);
    },
  );

  // D3: FSM + servicio real sobre un Prisma trampa. Cualquier acceso queda registrado y falla, aunque el servicio capture el error.
  test.each(['42', 'hola'])(
    'spec 03 ESC-41 · D3 · con el servicio real, %j (no es un número completo) responde "Pedido no encontrado" sin acceder a Prisma',
    async (input) => {
      const accesses: string[] = [];
      const trap = new Proxy(
        {},
        {
          get(_target, prop) {
            accesses.push(String(prop));
            throw new Error(`Acceso a Prisma no permitido: ${String(prop)}`);
          },
        },
      ) as unknown as PrismaClient;
      const session = makeSession('ORDER_LOOKUP');

      const messages = await send(session, input, createOrderService({ prisma: trap }));

      expectNotFound(messages);
      expect(accesses).toEqual([]);
      expect(session.state).toBe('ORDER_LOOKUP');
    },
  );
});

describe('TK-06.3 · spec 03 ESC-42 · volver al menú tras consultar (CH-03, D-03, D-11)', () => {
  test('spec 03 ESC-42 · carrito con A × 2: consultar un pedido y luego `0` → MAIN_MENU y el carrito conserva A × 2', async () => {
    const orders = createFakeLookup();
    const session = makeSession('ORDER_LOOKUP');

    const consulted = (await send(session, 'MED-00042', orders.service)).join('\n');
    expect(consulted).toContain('MED-00042');
    expect(consulted).toContain('PROCESSING');
    expect(session.state).toBe('ORDER_LOOKUP');

    const menu = (await send(session, '0', orders.service)).join('\n');

    expect(session.state).toBe('MAIN_MENU');
    expect(menu).toMatch(/1\)/);
    expect(menu).toMatch(/2\)\s*Mis pedidos/i);
    expect(session.cart).toEqual(CART);
    expect(orders.confirmations).toEqual([]);
  });
});
