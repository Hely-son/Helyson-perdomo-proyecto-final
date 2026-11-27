import { handleChatMessage, MENU_TEXT } from '../../../src/modules/chat/chat-fsm';
import { OrderInputError } from '../../../src/modules/orders/orders.service';
import { createFakeOrders, type FakeConfirmedOrder, type FakeOrders, type FakeOrdersService, rejected } from '../../helpers/chat-orders';
import { createFakeProducts, type FakeProduct, type FakeProducts, type FakeProductsService, priceRegex } from '../../helpers/chat-products';

// TK-05.6 · Pruebas de aceptación de QA (fase 1): resumen y confirmación del pedido en el chat (unidad, sin red ni base de datos).
// Spec 03 §4.2 (SUMMARY, RESOLVE_STOCK, CART), §4.3, F-6, F-7 ("Cierre de la confirmación", "Procedimiento ante un rechazo"), §8, §9,
// §10.5, §10.7; ESC-15/ESC-16 (SUMMARY y RESOLVE_STOCK, que reemplazan los test.todo de chat-fsm.test.ts), ESC-25, ESC-27, ESC-28 (nivel U),
// ESC-29, ESC-30, ESC-31, ESC-32, ESC-33, ESC-34, ESC-38, ESC-44, ESC-47; decisión D7 de TK-05.3 (errores internos al confirmar).
// Decisiones de la puerta 1 (2026-11-26): D-A (OrderInputError y errores internos llegan al llamador sin captura en el FSM; la sesión no
// cambia hasta recibir el resultado), D-B (getAvailability trae `price` string decimal de cualquier producto; el precio mostrado se guarda
// y se envía como string; sin aritmética de punto flotante), D-C (dependencia opcional que construye el mensaje del pedido confirmado),
// D-D (ajustar con stock disponible 0 equivale a retirar el ítem e informar), D-E (entrada inválida en SUMMARY repite el resumen
// almacenado sin consultar precios), D-G (CART: 1 Agregar otro producto, 2 Quitar ítem, 3 Confirmar compra).
//
// Supuestos de interfaz (docs/qa/TK-05.6-matrix.md):
//  - handleChatMessage(session, text, deps) con deps = { products, orders, confirmedOrderMessage? }.
//      products: listCatalog() y getAvailability(id) -> { id, name, price: string, isActive, currentStock } | null (tests/helpers/chat-products.ts).
//      orders: solo confirmOrder(input) (tests/helpers/chat-orders.ts).
//      confirmedOrderMessage?: (order: ConfirmedOrder) => string[]  (D-C; implementación por defecto: número de orden y estado PENDING).
//  - La sesión que recibe el FSM lleva `customerId: number` (la sesión del almacén ya lo tiene); ese cliente va a confirmOrder.
//  - El carrito sigue siendo un arreglo de líneas { productId, quantity } sin precio; el precio mostrado vive en el contexto de la sesión
//    (las pruebas no lo leen: lo observan por lo que el FSM envía a confirmOrder).
// Textos: libres salvo la numeración de las opciones (`N)` al inicio de línea), "no disponible", "vacío", el número de orden, "PENDING"
// y las cifras (subtotales, total, stock). Matriz: docs/qa/TK-05.6-matrix.md

type Session = Parameters<typeof handleChatMessage>[0];
type Deps = { products: FakeProductsService; orders: FakeOrdersService; confirmedOrderMessage?: (order: FakeConfirmedOrder) => string[] };
type Handle = (session: Session, text: string, deps: Deps) => Promise<string[]> | string[];
const handle = handleChatMessage as unknown as Handle;

const CUSTOMER_ID = 77;
const A: FakeProduct = { id: 201, name: 'Alcohol gel QA', price: '100.00', currentStock: 10, isActive: true };
const B: FakeProduct = { id: 202, name: 'Bata desechable QA', price: '50.00', currentStock: 10, isActive: true };
const C: FakeProduct = { id: 203, name: 'Casco de seguridad QA', price: '40.00', currentStock: 10, isActive: true };

type Line = { productId: number; quantity: number };
const line = (p: FakeProduct, quantity: number): Line => ({ productId: p.id, quantity });

const makeSession = (state: string, cart: Line[], customerId: number = CUSTOMER_ID): Session =>
  ({ customerId, state, cart }) as unknown as Session;

interface Env {
  fake: FakeProducts;
  orders: FakeOrders;
  deps: Deps;
}
const makeEnv = (products: FakeProduct[], extra: Partial<Deps> = {}): Env => {
  const fake = createFakeProducts(products);
  const orders = createFakeOrders();
  return { fake, orders, deps: { products: fake.service, orders: orders.service, ...extra } };
};

/** Envía un mensaje y devuelve el texto del bot (todas las burbujas unidas), exigiendo respuestas no vacías. */
async function say(env: Env, session: Session, text: string): Promise<string> {
  const messages = await handle(session, text, env.deps);
  expect(Array.isArray(messages)).toBe(true);
  expect(messages.length).toBeGreaterThanOrEqual(1);
  for (const m of messages) {
    expect(typeof m).toBe('string');
    expect(m.trim().length).toBeGreaterThan(0);
  }
  return messages.join('\n');
}

const lines = (text: string): string[] => text.split('\n').map((l) => l.trim());
const lineOf = (text: string, name: string): string | undefined => lines(text).find((l) => l.includes(name));
const totalLine = (text: string): string | undefined => lines(text).find((l) => /total/i.test(l));
const hasOption = (text: string, n: number, word: RegExp): boolean =>
  lines(text).some((l) => new RegExp(`^${n}\\)`).test(l) && word.test(l));
const cartLines = (session: Session): Line[] =>
  (session.cart as unknown as Line[]).map((l) => ({ productId: l.productId, quantity: l.quantity }));

const NOT_AVAILABLE = /no (est[aá] )?disponible/i;
const EMPTY_CART = /vac[ií]o/i;
const ORDER_NUMBER = /MED-\d{5,}/;

/** Un resumen válido: opciones 1 confirmar y 2 volver al carrito. */
function expectSummaryOptions(text: string): void {
  expect(hasOption(text, 1, /confirmar/i)).toBe(true);
  expect(hasOption(text, 2, /volver/i)).toBe(true);
}

/** Una línea de producto con su subtotal y la línea del total (spec 03 F-6, CH-06). */
function expectSummary(text: string, items: { product: FakeProduct; subtotal: string }[], total: string): void {
  for (const { product, subtotal } of items) {
    const l = lineOf(text, product.name);
    expect(l).toBeDefined();
    expect(l).toMatch(priceRegex(subtotal));
  }
  const t = totalLine(text);
  expect(t).toBeDefined();
  expect(t).toMatch(priceRegex(total));
  expectSummaryOptions(text);
}

/** Carrito dado en estado CART; `3` (Confirmar compra, D-G) lleva a SUMMARY. Devuelve la sesión y el texto del resumen. */
async function toSummary(env: Env, cart: Line[]): Promise<{ session: Session; text: string }> {
  const session = makeSession('CART', cart);
  const text = await say(env, session, '3');
  expect(session.state).toBe('SUMMARY');
  return { session, text };
}

/** Desde SUMMARY con un rechazo de stock: devuelve el texto de la respuesta a `1` y deja la sesión en RESOLVE_STOCK. */
async function toResolveStock(env: Env, cart: Line[], rejections: Parameters<typeof rejected>): Promise<{ session: Session; text: string }> {
  const { session } = await toSummary(env, cart);
  env.orders.script.push(rejected(...rejections));
  const text = await say(env, session, '1');
  expect(session.state).toBe('RESOLVE_STOCK');
  return { session, text };
}

describe('TK-05.6 · FSM · SUMMARY: resumen con precios vigentes (F-6, CH-06, D-07, D-10, D-G)', () => {
  test('ESC-27 · A × 2 (100.00) y B × 1 (50.00): `3` en CART muestra subtotales 200.00 y 50.00, total 250.00 y pide `1`/`2`; sin pedido y carrito intacto', async () => {
    const env = makeEnv([A, B]);
    const cart = [line(A, 2), line(B, 1)];
    const { session, text } = await toSummary(env, cart);

    expectSummary(text, [{ product: A, subtotal: '200.00' }, { product: B, subtotal: '50.00' }], '250.00');
    expect(cartLines(session)).toEqual(cart);
    expect(env.orders.calls).toEqual([]); // ningún pedido hasta `1` en SUMMARY (spec 03 §9.1)
  });

  test('D-B · subtotales y total sin aritmética de punto flotante (0.10 × 3, 0.07 × 3, 19.99 × 7)', async () => {
    const p1: FakeProduct = { ...A, id: 301, name: 'Producto diez centavos QA', price: '0.10' };
    const p2: FakeProduct = { ...A, id: 302, name: 'Producto siete centavos QA', price: '0.07' };
    const p3: FakeProduct = { ...A, id: 303, name: 'Producto diecinueve QA', price: '19.99' };
    const env = makeEnv([p1, p2, p3]);
    const { text } = await toSummary(env, [line(p1, 3), line(p2, 3), line(p3, 7)]);

    // 0.30 + 0.21 + 139.93 = 140.44
    expectSummary(text, [{ product: p1, subtotal: '0.30' }, { product: p2, subtotal: '0.21' }, { product: p3, subtotal: '139.93' }], '140.44');
    expect(text).not.toMatch(/\d\.\d{3,}/); // ninguna cifra con más de dos decimales (0.30000000000000004, 139.92999999999998)
  });

  test('D-B / F-7.1 · el precio mostrado se guarda como string y se envía tal cual a confirmOrder, aunque el precio vigente cambie después', async () => {
    const p1: FakeProduct = { ...A, id: 301, name: 'Producto diez centavos QA', price: '0.10' };
    const env = makeEnv([p1, B]);
    const { session } = await toSummary(env, [line(p1, 3), line(B, 1)]);
    env.fake.find(p1.id).price = '0.20'; // el operador cambia el precio después de mostrar el resumen

    await say(env, session, '1');

    expect(env.orders.calls).toHaveLength(1);
    const sent = env.orders.calls[0].items;
    expect(sent).toEqual([
      { productId: p1.id, quantity: 3, shownUnitPrice: '0.10' },
      { productId: B.id, quantity: 1, shownUnitPrice: '50.00' },
    ]);
    for (const i of sent) expect(typeof i.shownUnitPrice).toBe('string');
  });

  test('D-G · CART con líneas ofrece `3) Confirmar compra`; el resumen no consulta stock ni estado (D-10): un producto ya inactivo aparece con su precio y no se llama a orders', async () => {
    const env = makeEnv([A, B]);
    env.fake.find(B.id).isActive = false; // el operador lo desactivó tras agregarlo
    const { text } = await toSummary(env, [line(A, 1), line(B, 1)]);

    expectSummary(text, [{ product: A, subtotal: '100.00' }, { product: B, subtotal: '50.00' }], '150.00');
    expect(env.orders.calls).toEqual([]);
  });

  test('ESC-25 · carrito vacío en CART, `3`: informa que está vacío; no muestra resumen; sigue en CART; no se llama a orders', async () => {
    const env = makeEnv([A]);
    const session = makeSession('CART', []);

    const text = await say(env, session, '3');

    expect(session.state).toBe('CART');
    expect(text).toMatch(EMPTY_CART);
    expect(hasOption(text, 1, /confirmar/i)).toBe(false);
    expect(totalLine(text)).toBeUndefined();
    expect(cartLines(session)).toEqual([]);
    expect(env.orders.calls).toEqual([]);
  });

  test('ESC-15 · `0` en SUMMARY vuelve al menú conservando el carrito, sin llamar a orders; un resumen posterior vuelve a consultar los precios (D-07)', async () => {
    const env = makeEnv([A]);
    const { session } = await toSummary(env, [line(A, 2)]);

    const menu = await say(env, session, '0');
    expect(session.state).toBe('MAIN_MENU');
    expect(menu).toContain(MENU_TEXT);
    expect(cartLines(session)).toEqual([line(A, 2)]);

    env.fake.find(A.id).price = '110.00'; // cambia mientras el cliente está fuera del resumen
    const catalog = await say(env, session, '1');
    const cartOption = lines(catalog).find((l) => /^\d+\)\s*Ver carrito/i.test(l));
    await say(env, session, /^(\d+)\)/.exec(cartOption!)![1]);
    expect(session.state).toBe('CART');
    const again = await say(env, session, '3');

    expectSummary(again, [{ product: A, subtotal: '220.00' }], '220.00');
    expect(env.orders.calls).toEqual([]);
  });

  test('ESC-38 · `2` en SUMMARY vuelve a CART con el carrito intacto; con el precio cambiado a 110.00, el nuevo resumen muestra 110.00 y el pedido se crea con 110.00 sin PRICE_CHANGED', async () => {
    const env = makeEnv([A]);
    const { session, text } = await toSummary(env, [line(A, 2)]);
    expectSummary(text, [{ product: A, subtotal: '200.00' }], '200.00');

    const back = await say(env, session, '2');
    expect(session.state).toBe('CART');
    expect(back).toContain(A.name);
    expect(cartLines(session)).toEqual([line(A, 2)]);
    expect(env.orders.calls).toEqual([]);

    env.fake.find(A.id).price = '110.00'; // el operador cambia el precio
    const again = await say(env, session, '3');
    expectSummary(again, [{ product: A, subtotal: '220.00' }], '220.00');

    const done = await say(env, session, '1');
    expect(env.orders.calls).toHaveLength(1); // una sola llamada: no hubo rechazo PRICE_CHANGED previo
    expect(env.orders.calls[0].items).toEqual([{ productId: A.id, quantity: 2, shownUnitPrice: '110.00' }]);
    expect(done).toMatch(ORDER_NUMBER);
    expect(session.state).toBe('MAIN_MENU');
  });

  test.each(['xyz', '3', '', '1.5'])(
    'ESC-16 / D-E · la entrada inválida %j en SUMMARY repite el resumen almacenado con los precios guardados, sin consultar precios ni llamar a orders; estado y carrito intactos',
    async (input) => {
      const env = makeEnv([A, B]);
      const { session } = await toSummary(env, [line(A, 2), line(B, 1)]);
      env.fake.find(A.id).price = '999.00'; // un precio nuevo que el resumen repetido NO debe mostrar
      const queriesBefore = env.fake.calls.length;

      const text = await say(env, session, input);

      expect(session.state).toBe('SUMMARY');
      expect(env.fake.calls).toHaveLength(queriesBefore); // D-E: sin volver a consultar precios
      expect(env.orders.calls).toEqual([]);
      expect(cartLines(session)).toEqual([line(A, 2), line(B, 1)]);
      expectSummary(text, [{ product: A, subtotal: '200.00' }, { product: B, subtotal: '50.00' }], '250.00');

      await say(env, session, '1'); // y la confirmación posterior sigue usando los precios guardados
      expect(env.orders.calls[0].items.map((i) => i.shownUnitPrice)).toEqual(['100.00', '50.00']);
    },
  );
});

describe('TK-05.6 · FSM · pedido creado (F-7, CH-07, CA-03, D-08, ESC-28, ESC-34)', () => {
  test('ESC-28 (U) · `1` en SUMMARY envía cliente e ítems en el orden del carrito con el precio mostrado; responde con número de orden y PENDING; MAIN_MENU y carrito vacío', async () => {
    const env = makeEnv([A, B]);
    const { session } = await toSummary(env, [line(A, 2), line(B, 1)]);

    const text = await say(env, session, '1');

    expect(env.orders.calls).toEqual([
      {
        customerId: CUSTOMER_ID,
        items: [
          { productId: A.id, quantity: 2, shownUnitPrice: '100.00' },
          { productId: B.id, quantity: 1, shownUnitPrice: '50.00' },
        ],
      },
    ]);
    expect(text).toMatch(ORDER_NUMBER);
    expect(text).toContain('PENDING');
    expect(session.state).toBe('MAIN_MENU');
    expect(cartLines(session)).toEqual([]);
  });

  test('ESC-34 · tras el pedido, repetir `1` se interpreta en MAIN_MENU (catálogo) y no se llama otra vez a orders', async () => {
    const env = makeEnv([A, B]);
    const { session } = await toSummary(env, [line(A, 2)]);
    await say(env, session, '1');
    expect(env.orders.calls).toHaveLength(1);

    const text = await say(env, session, '1');

    expect(session.state).toBe('CATALOG');
    expect(text).toContain(A.name);
    expect(env.orders.calls).toHaveLength(1);
    expect(cartLines(session)).toEqual([]);
  });

  test('D-C · la dependencia opcional recibe el pedido devuelto y se invoca cuando la sesión ya está en MAIN_MENU con el carrito vacío; su salida es la respuesta', async () => {
    let seen: { state: string; cart: Line[] } | undefined;
    let received: FakeConfirmedOrder | undefined;
    const holder: { session?: Session } = {};
    const confirmedOrderMessage = jest.fn((order: FakeConfirmedOrder): string[] => {
      received = order;
      seen = { state: holder.session!.state, cart: cartLines(holder.session!) };
      return [`Tu pedido ${order.orderNumber} quedó en PENDING (mensaje QA).`];
    });
    const env = makeEnv([A], { confirmedOrderMessage });
    const { session } = await toSummary(env, [line(A, 2)]);
    holder.session = session;

    const text = await say(env, session, '1');

    expect(confirmedOrderMessage).toHaveBeenCalledTimes(1);
    expect(received?.orderNumber).toMatch(ORDER_NUMBER);
    expect(received?.status).toBe('PENDING');
    expect(seen).toEqual({ state: 'MAIN_MENU', cart: [] }); // F-7 "Cierre de la confirmación", paso 1: antes de construir la respuesta
    expect(text).toContain(`Tu pedido ${received!.orderNumber} quedó en PENDING (mensaje QA).`);
  });

  test('D-A / ESC-48 (U) · si la dependencia que construye el mensaje lanza, el error llega al llamador, la sesión queda en MAIN_MENU con carrito vacío y `1` no crea otro pedido', async () => {
    const boom = new Error('fallo inyectado QA TK-05.6');
    const env = makeEnv([A], { confirmedOrderMessage: () => { throw boom; } });
    const { session } = await toSummary(env, [line(A, 2)]);

    await expect(handle(session, '1', env.deps)).rejects.toBe(boom);

    expect(env.orders.calls).toHaveLength(1);
    expect(session.state).toBe('MAIN_MENU'); // no vuelve a SUMMARY (cierre de la confirmación, paso 2)
    expect(cartLines(session)).toEqual([]);

    const retry = await say(env, session, '1');
    expect(session.state).toBe('CATALOG');
    expect(retry).toContain(A.name);
    expect(env.orders.calls).toHaveLength(1);
  });
});

describe('TK-05.6 · FSM · errores al confirmar sin pedido creado (DP-07, ESC-37, D-A, D7 de TK-05.3)', () => {
  test.each([
    ['OrderInputError (D7)', new OrderInputError('detalle interno de entrada inválida')],
    ['Error genérico', new Error('detalle interno inesperado')],
  ])(
    'D-A · %s: el FSM no lo captura (llega al llamador); durante la llamada la sesión sigue en SUMMARY con el carrito; tras el error conserva SUMMARY, carrito y precios mostrados, y el reintento los usa',
    async (_name, error) => {
      const env = makeEnv([A, B]);
      const { session } = await toSummary(env, [line(A, 2), line(B, 1)]);
      let during: { state: string; cart: Line[] } | undefined;
      env.orders.onCall = () => {
        during = { state: session.state, cart: cartLines(session) };
      };
      env.orders.script.push(error);

      await expect(handle(session, '1', env.deps)).rejects.toBe(error);

      expect(during).toEqual({ state: 'SUMMARY', cart: [line(A, 2), line(B, 1)] }); // nada cambia antes de recibir el resultado
      expect(session.state).toBe('SUMMARY');
      expect(cartLines(session)).toEqual([line(A, 2), line(B, 1)]);

      env.fake.find(A.id).price = '999.00'; // el reintento no vuelve a consultar los precios: usa los mostrados
      const done = await say(env, session, '1');

      expect(env.orders.calls).toHaveLength(2);
      expect(env.orders.calls[1]).toEqual(env.orders.calls[0]);
      expect(env.orders.calls[1].items.map((i) => i.shownUnitPrice)).toEqual(['100.00', '50.00']);
      expect(done).toMatch(ORDER_NUMBER);
      expect(session.state).toBe('MAIN_MENU');
      expect(cartLines(session)).toEqual([]);
    },
  );
});

describe('TK-05.6 · FSM · PRICE_CHANGED (RN-03, CA-15, ESC-31, ESC-32)', () => {
  test('ESC-31 · A × 2 mostrado a 100.00 y vigente 120.00: `1` no crea pedido y muestra un nuevo resumen con 120.00; la nueva `1` envía 120.00 y crea el pedido', async () => {
    const env = makeEnv([A]);
    const { session } = await toSummary(env, [line(A, 2)]);
    env.fake.find(A.id).price = '120.00';
    env.orders.script.push(rejected({ productId: A.id, reason: 'PRICE_CHANGED', currentUnitPrice: '120.00' }));

    const text = await say(env, session, '1');

    expect(env.orders.calls).toHaveLength(1);
    expect(session.state).toBe('SUMMARY');
    expect(cartLines(session)).toEqual([line(A, 2)]);
    expectSummary(text, [{ product: A, subtotal: '240.00' }], '240.00');
    expect(text).not.toMatch(ORDER_NUMBER);

    const done = await say(env, session, '1'); // nueva confirmación: vuelve a pasar por orders (F-7, paso 4)
    expect(env.orders.calls).toHaveLength(2);
    expect(env.orders.calls[1].items).toEqual([{ productId: A.id, quantity: 2, shownUnitPrice: '120.00' }]);
    expect(done).toMatch(ORDER_NUMBER);
    expect(session.state).toBe('MAIN_MENU');
    expect(cartLines(session)).toEqual([]);
  });

  test('ESC-32 · el precio cambia otra vez antes de la segunda confirmación: dos rechazos con resúmenes a 120.00 y 130.00; la tercera confirmación crea el pedido a 130.00', async () => {
    const env = makeEnv([A]);
    const { session } = await toSummary(env, [line(A, 2)]);
    env.fake.find(A.id).price = '120.00';
    env.orders.script.push(rejected({ productId: A.id, reason: 'PRICE_CHANGED', currentUnitPrice: '120.00' }));
    const first = await say(env, session, '1');
    expectSummary(first, [{ product: A, subtotal: '240.00' }], '240.00');

    env.fake.find(A.id).price = '130.00';
    env.orders.script.push(rejected({ productId: A.id, reason: 'PRICE_CHANGED', currentUnitPrice: '130.00' }));
    const second = await say(env, session, '1');
    expect(session.state).toBe('SUMMARY');
    expectSummary(second, [{ product: A, subtotal: '260.00' }], '260.00');

    const done = await say(env, session, '1');
    expect(env.orders.calls.map((c) => c.items[0].shownUnitPrice)).toEqual(['100.00', '120.00', '130.00']);
    expect(done).toMatch(ORDER_NUMBER);
    expect(session.state).toBe('MAIN_MENU');
  });
});

describe('TK-05.6 · FSM · PRODUCT_INACTIVE (RN-02, CA-14, DP-02, ESC-30, ESC-47)', () => {
  test('ESC-30 · A y B; B desactivado: `1` no crea pedido, informa que B ya no está disponible, lo retira y muestra un nuevo resumen solo con A; la segunda `1` crea el pedido solo con A', async () => {
    const env = makeEnv([A, B]);
    const { session } = await toSummary(env, [line(A, 1), line(B, 1)]);
    env.fake.find(B.id).isActive = false;
    env.orders.script.push(rejected({ productId: B.id, reason: 'PRODUCT_INACTIVE' }));

    const text = await say(env, session, '1');

    expect(env.orders.calls).toHaveLength(1);
    expect(env.orders.calls[0].items.map((i) => i.productId)).toEqual([A.id, B.id]);
    expect(text).toMatch(NOT_AVAILABLE);
    expect(text).toContain(B.name);
    expect(cartLines(session)).toEqual([line(A, 1)]);
    expect(session.state).toBe('SUMMARY');
    expectSummary(text, [{ product: A, subtotal: '100.00' }], '100.00');
    expect(totalLine(text)).not.toMatch(priceRegex('150.00'));

    const done = await say(env, session, '1');
    expect(env.orders.calls).toHaveLength(2);
    expect(env.orders.calls[1].items).toEqual([{ productId: A.id, quantity: 1, shownUnitPrice: '100.00' }]);
    expect(done).toMatch(ORDER_NUMBER);
    expect(session.state).toBe('MAIN_MENU');
  });

  test('ESC-47 · carrito con solo B desactivado tras mostrar el resumen: `1` informa que B ya no está disponible, carrito vacío y estado CART (sin resumen)', async () => {
    const env = makeEnv([B]);
    const { session } = await toSummary(env, [line(B, 1)]);
    env.fake.find(B.id).isActive = false;
    env.orders.script.push(rejected({ productId: B.id, reason: 'PRODUCT_INACTIVE' }));

    const text = await say(env, session, '1');

    expect(env.orders.calls).toHaveLength(1);
    expect(text).toMatch(NOT_AVAILABLE);
    expect(cartLines(session)).toEqual([]);
    expect(session.state).toBe('CART');
    expect(hasOption(text, 1, /confirmar/i)).toBe(false);
    expect(totalLine(text)).toBeUndefined();
  });
});

describe('TK-05.6 · FSM · STOCK_INSUFFICIENT y RESOLVE_STOCK (RN-02, CA-05, DP-03, DP-04, D-09, ESC-29, ESC-44, D-D)', () => {
  test('ESC-29 · A × 4 con stock 2: `1` no crea pedido y ofrece ajustar, quitar o cancelar (RESOLVE_STOCK); ajustar deja A × 2 y muestra un nuevo resumen que exige confirmar; la confirmación nueva crea el pedido', async () => {
    const env = makeEnv([A]);
    env.fake.find(A.id).currentStock = 2;
    const { session, text } = await toResolveStock(env, [line(A, 4)], [{ productId: A.id, reason: 'STOCK_INSUFFICIENT', availableStock: 2 }]);

    expect(env.orders.calls).toHaveLength(1);
    expect(text).toContain(A.name);
    expect(text).toMatch(/\b2\b/); // el stock disponible
    expect(hasOption(text, 1, /ajustar/i)).toBe(true);
    expect(hasOption(text, 2, /quitar/i)).toBe(true);
    expect(hasOption(text, 3, /cancelar/i)).toBe(true);
    expect(cartLines(session)).toEqual([line(A, 4)]); // nada cambia hasta que el cliente decide

    const summary = await say(env, session, '1'); // ajustar al disponible
    expect(session.state).toBe('SUMMARY');
    expect(cartLines(session)).toEqual([line(A, 2)]);
    expectSummary(summary, [{ product: A, subtotal: '200.00' }], '200.00');
    expect(env.orders.calls).toHaveLength(1); // el nuevo resumen no confirma por su cuenta

    const done = await say(env, session, '1');
    expect(env.orders.calls).toHaveLength(2);
    expect(env.orders.calls[1].items).toEqual([{ productId: A.id, quantity: 2, shownUnitPrice: '100.00' }]);
    expect(done).toMatch(ORDER_NUMBER);
  });

  test('D-09 · varios ítems sin stock se resuelven de uno en uno, en el orden del carrito (no en el de la lista de rechazos); 1 ajusta, 2 quita; al terminar, nuevo resumen con lo que queda', async () => {
    const env = makeEnv([A, B, C]);
    // Carrito [B × 5, A × 4, C × 1]; el servicio devuelve los rechazos en otro orden (A antes que B).
    const { session, text: first } = await toResolveStock(env, [line(B, 5), line(A, 4), line(C, 1)], [
      { productId: A.id, reason: 'STOCK_INSUFFICIENT', availableStock: 2 },
      { productId: B.id, reason: 'STOCK_INSUFFICIENT', availableStock: 3 },
    ]);
    expect(first).toContain(B.name); // primero el de la primera línea del carrito
    expect(first).not.toContain(A.name);
    expect(first).toMatch(/\b3\b/);
    expect(cartLines(session)).toEqual([line(B, 5), line(A, 4), line(C, 1)]);

    const second = await say(env, session, '1'); // ajusta B a 3
    expect(session.state).toBe('RESOLVE_STOCK');
    expect(cartLines(session)).toEqual([line(B, 3), line(A, 4), line(C, 1)]);
    expect(second).toContain(A.name);
    expect(second).toMatch(/\b2\b/);
    expect(hasOption(second, 3, /cancelar/i)).toBe(true);

    const summary = await say(env, session, '2'); // quita A
    expect(session.state).toBe('SUMMARY');
    expect(cartLines(session)).toEqual([line(B, 3), line(C, 1)]);
    expectSummary(summary, [{ product: B, subtotal: '150.00' }, { product: C, subtotal: '40.00' }], '190.00');
    expect(env.orders.calls).toHaveLength(1);
  });

  test('ESC-44 · en RESOLVE_STOCK por A (con B también en el carrito), `3` cancela la compra: carrito vacío, MAIN_MENU con el menú y ningún pedido; no se vuelve a llamar a orders', async () => {
    const env = makeEnv([A, B]);
    const { session } = await toResolveStock(env, [line(A, 4), line(B, 1)], [{ productId: A.id, reason: 'STOCK_INSUFFICIENT', availableStock: 2 }]);

    const text = await say(env, session, '3');

    expect(session.state).toBe('MAIN_MENU');
    expect(cartLines(session)).toEqual([]);
    expect(text).toContain(MENU_TEXT);
    expect(env.orders.calls).toHaveLength(1); // solo el intento rechazado

    const next = await say(env, session, '1');
    expect(session.state).toBe('CATALOG');
    expect(next).toContain(A.name);
    expect(env.orders.calls).toHaveLength(1);
  });

  test('DP-02 / DP-04 · quitar el único ítem pendiente deja el carrito vacío: vuelve a CART informando que está vacío (sin resumen)', async () => {
    const env = makeEnv([A]);
    const { session } = await toResolveStock(env, [line(A, 4)], [{ productId: A.id, reason: 'STOCK_INSUFFICIENT', availableStock: 2 }]);

    const text = await say(env, session, '2');

    expect(session.state).toBe('CART');
    expect(cartLines(session)).toEqual([]);
    expect(text).toMatch(EMPTY_CART);
    expect(hasOption(text, 1, /confirmar/i)).toBe(false);
  });

  test('D-D · "ajustar" con stock disponible 0 equivale a retirar el ítem e informar (no deja una línea con cantidad 0); si queda otro ítem, nuevo resumen con él', async () => {
    const env = makeEnv([A, B]);
    env.fake.find(A.id).currentStock = 0;
    const { session } = await toResolveStock(env, [line(A, 4), line(B, 1)], [{ productId: A.id, reason: 'STOCK_INSUFFICIENT', availableStock: 0 }]);

    const text = await say(env, session, '1');

    expect(cartLines(session)).toEqual([line(B, 1)]); // ninguna línea con cantidad 0
    expect(text).toMatch(/no (est[aá] )?disponible|agotad|sin stock/i);
    expect(session.state).toBe('SUMMARY');
    expectSummary(text, [{ product: B, subtotal: '50.00' }], '50.00');
    expect(env.orders.calls).toHaveLength(1);
  });

  test('D-D · con stock disponible 0 y A como único ítem, `1` retira A: carrito vacío y estado CART', async () => {
    const env = makeEnv([A]);
    env.fake.find(A.id).currentStock = 0;
    const { session } = await toResolveStock(env, [line(A, 4)], [{ productId: A.id, reason: 'STOCK_INSUFFICIENT', availableStock: 0 }]);

    const text = await say(env, session, '1');

    expect(cartLines(session)).toEqual([]);
    expect(session.state).toBe('CART');
    expect(text).toMatch(EMPTY_CART);
  });

  test('ESC-15 · `0` en RESOLVE_STOCK vuelve al menú conservando el carrito tal como estaba, sin llamar a orders; `1` abre el catálogo (no reanuda la resolución)', async () => {
    const env = makeEnv([A, B]);
    const { session } = await toResolveStock(env, [line(A, 4), line(B, 1)], [{ productId: A.id, reason: 'STOCK_INSUFFICIENT', availableStock: 2 }]);

    const menu = await say(env, session, '0');

    expect(session.state).toBe('MAIN_MENU');
    expect(menu).toContain(MENU_TEXT);
    expect(cartLines(session)).toEqual([line(A, 4), line(B, 1)]);
    expect(env.orders.calls).toHaveLength(1);

    await say(env, session, '1');
    expect(session.state).toBe('CATALOG');
  });

  test.each(['xyz', '', '4', '9', '1.5'])(
    'ESC-16 · la entrada inválida %j en RESOLVE_STOCK repite las opciones del ítem en curso; estado y carrito sin cambios; sin llamar a orders',
    async (input) => {
      const env = makeEnv([A, B]);
      const { session } = await toResolveStock(env, [line(A, 4), line(B, 1)], [{ productId: A.id, reason: 'STOCK_INSUFFICIENT', availableStock: 2 }]);

      const text = await say(env, session, input);

      expect(session.state).toBe('RESOLVE_STOCK');
      expect(cartLines(session)).toEqual([line(A, 4), line(B, 1)]);
      expect(text).toContain(A.name);
      expect(hasOption(text, 1, /ajustar/i)).toBe(true);
      expect(hasOption(text, 2, /quitar/i)).toBe(true);
      expect(hasOption(text, 3, /cancelar/i)).toBe(true);
      expect(env.orders.calls).toHaveLength(1);
    },
  );
});

describe('TK-05.6 · FSM · varios motivos a la vez (DP-03, ESC-33)', () => {
  test('ESC-33 · A inactivo, B × 4 con stock 2 y C con precio cambiado: inactivos primero (se retira A e informa), luego RESOLVE_STOCK por B, luego nuevo resumen con B × 2 y C al precio vigente; la tercera `1` crea el pedido', async () => {
    const env = makeEnv([A, B, C]);
    const { session } = await toSummary(env, [line(A, 1), line(B, 4), line(C, 1)]);
    env.fake.find(A.id).isActive = false;
    env.fake.find(B.id).currentStock = 2;
    env.fake.find(C.id).price = '45.00';
    // La lista de rechazos llega en un orden cualquiera: el FSM aplica el orden de DP-03.
    env.orders.script.push(
      rejected(
        { productId: C.id, reason: 'PRICE_CHANGED', currentUnitPrice: '45.00' },
        { productId: B.id, reason: 'STOCK_INSUFFICIENT', availableStock: 2 },
        { productId: A.id, reason: 'PRODUCT_INACTIVE' },
      ),
    );

    const first = await say(env, session, '1');

    expect(env.orders.calls).toHaveLength(1);
    expect(first).toMatch(NOT_AVAILABLE);
    expect(first.indexOf(A.name)).toBeGreaterThanOrEqual(0);
    expect(first.indexOf(A.name)).toBeLessThan(first.indexOf(B.name)); // 1) inactivos, 2) stock
    expect(session.state).toBe('RESOLVE_STOCK');
    expect(cartLines(session)).toEqual([line(B, 4), line(C, 1)]); // A ya retirado antes de resolver el stock
    expect(hasOption(first, 1, /ajustar/i)).toBe(true);
    expect(hasOption(first, 1, /confirmar/i)).toBe(false); // todavía no hay resumen

    const summary = await say(env, session, '1'); // ajusta B a 2 → 3) nuevo resumen con los precios vigentes
    expect(session.state).toBe('SUMMARY');
    expect(cartLines(session)).toEqual([line(B, 2), line(C, 1)]);
    expectSummary(summary, [{ product: B, subtotal: '100.00' }, { product: C, subtotal: '45.00' }], '145.00');
    expect(env.orders.calls).toHaveLength(1);

    const done = await say(env, session, '1');
    expect(env.orders.calls).toHaveLength(2);
    expect(env.orders.calls[1].items).toEqual([
      { productId: B.id, quantity: 2, shownUnitPrice: '50.00' },
      { productId: C.id, quantity: 1, shownUnitPrice: '45.00' },
    ]);
    expect(done).toMatch(ORDER_NUMBER);
    expect(session.state).toBe('MAIN_MENU');
    expect(cartLines(session)).toEqual([]);
  });
});
