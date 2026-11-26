import { handleChatMessage } from '../../../src/modules/chat/chat-fsm';
import { createFakeProducts, type FakeProductsService, PRODUCT_A, PRODUCT_B } from '../../helpers/chat-products';

// TK-05.1 · Pruebas de aceptación de QA (fase 1): motor FSM, estados del menú (unidad, sin red ni base de datos).
// Spec 03 §4.2 (tabla de estados y reglas comunes), F-3; ESC-14, ESC-15 y ESC-16 (parciales, D-E).
// Decisiones de la puerta 1 (2026-11-26): D-A (en MAIN_MENU, `1` → CATALOG y `2` → ORDER_LOOKUP con mensajes
// provisionales; `0` vuelve al menú desde cualquier estado conservando el carrito), D-E (cobertura parcial).
// Interfaz asumida: handleChatMessage(session: { state; cart }, text) muta session.state y devuelve los textos del bot.
// El tipo de la sesión se deduce de la firma: las pruebas no dependen de la forma de las líneas del carrito (TK-05.2).
// TK-05.2: handleChatMessage recibe un tercer argumento `deps = { products }` (servicio de productos; aquí simulado, ver
// tests/helpers/chat-products.ts). CATALOG deja de ser provisional: se prueba en chat-catalog-cart.test.ts.
// Matriz: docs/qa/TK-05.1-matrix.md y docs/qa/TK-05.2-matrix.md

type Session = Parameters<typeof handleChatMessage>[0];
type Handle = (session: Session, text: string, deps: { products: FakeProductsService }) => Promise<string[]> | string[];
const handle = handleChatMessage as unknown as Handle;
const deps = { products: createFakeProducts([PRODUCT_A, PRODUCT_B]).service };

const makeSession = (state: string, cart: unknown[] = []): Session => ({
  state: state as Session['state'],
  cart: cart as unknown as Session['cart'],
});

const TWO_ITEMS = [
  { productId: 1, quantity: 2 },
  { productId: 2, quantity: 1 },
];

const reply = async (session: Session, text: string): Promise<string[]> => {
  const messages = await handle(session, text, deps);
  expect(Array.isArray(messages)).toBe(true);
  expect(messages.length).toBeGreaterThanOrEqual(1);
  for (const m of messages) {
    expect(typeof m).toBe('string');
    expect(m.trim().length).toBeGreaterThan(0);
  }
  return messages;
};

/** El menú MVP ofrece solo 1) Catálogo y compra y 2) Mis pedidos (CH-03; CH-10 es V2). */
function expectMvpMenu(messages: string[]): void {
  const text = messages.join('\n');
  expect(text).toMatch(/1\)/);
  expect(text).toMatch(/Cat[aá]logo/i);
  expect(text).toMatch(/2\)/);
  expect(text).toMatch(/Mis pedidos/i);
  expect(text).not.toMatch(/3\)/);
  expect(text).not.toMatch(/reclam/i);
}

describe('TK-05.1 · FSM · MAIN_MENU (spec 03 §4.2)', () => {
  test('D-A · `1` en MAIN_MENU pasa a CATALOG y responde con un mensaje; el carrito no cambia', async () => {
    const session = makeSession('MAIN_MENU', structuredClone(TWO_ITEMS));
    await reply(session, '1');
    expect(session.state).toBe('CATALOG');
    expect(session.cart).toEqual(TWO_ITEMS);
  });

  test('D-A · `2` en MAIN_MENU pasa a ORDER_LOOKUP y responde con un mensaje; el carrito no cambia', async () => {
    const session = makeSession('MAIN_MENU', structuredClone(TWO_ITEMS));
    await reply(session, '2');
    expect(session.state).toBe('ORDER_LOOKUP');
    expect(session.cart).toEqual(TWO_ITEMS);
  });

  test('ESC-14 · `3` en MAIN_MENU es entrada inválida: repite el menú con solo 1) y 2) (no existe Reclamo) y no cambia estado ni carrito', async () => {
    const session = makeSession('MAIN_MENU', structuredClone(TWO_ITEMS));
    const messages = await reply(session, '3');
    expectMvpMenu(messages);
    expect(session.state).toBe('MAIN_MENU');
    expect(session.cart).toEqual(TWO_ITEMS);
  });

  test.each(['xyz', '', '   ', '4', '99', '-1'])(
    'ESC-16 (MAIN_MENU) · la entrada inválida %j repite el menú sin cambiar estado ni carrito',
    async (input) => {
      const session = makeSession('MAIN_MENU', structuredClone(TWO_ITEMS));
      const messages = await reply(session, input);
      expectMvpMenu(messages);
      expect(session.state).toBe('MAIN_MENU');
      expect(session.cart).toEqual(TWO_ITEMS);
    },
  );

  test('el menú mostrado por `0` en MAIN_MENU ofrece solo 1) y 2)', async () => {
    const session = makeSession('MAIN_MENU');
    expectMvpMenu(await reply(session, '0'));
    expect(session.state).toBe('MAIN_MENU');
  });
});

describe('TK-05.1 · FSM · `0` vuelve al menú conservando el carrito (ESC-15 parcial, D-E, D-03)', () => {
  // D-E: solo los estados implementados en TK-05.1 (MAIN_MENU y los provisionales alcanzables: CATALOG, ORDER_LOOKUP).
  test.each(['MAIN_MENU', 'CATALOG', 'ORDER_LOOKUP'])(
    'ESC-15 · con 2 ítems en el carrito, `0` desde %s → MAIN_MENU con el menú y el carrito intacto',
    async (state) => {
      const session = makeSession(state, structuredClone(TWO_ITEMS));
      const messages = await reply(session, '0');
      expect(session.state).toBe('MAIN_MENU');
      expectMvpMenu(messages);
      expect(session.cart).toEqual(TWO_ITEMS);
    },
  );

  test('ESC-15 · el flujo real: MAIN_MENU → `1` → `0` y MAIN_MENU → `2` → `0` conservan el carrito', async () => {
    const session = makeSession('MAIN_MENU', structuredClone(TWO_ITEMS));
    await reply(session, '1');
    expect(session.state).toBe('CATALOG');
    await reply(session, '0');
    expect(session.state).toBe('MAIN_MENU');
    await reply(session, '2');
    expect(session.state).toBe('ORDER_LOOKUP');
    expectMvpMenu(await reply(session, '0'));
    expect(session.state).toBe('MAIN_MENU');
    expect(session.cart).toEqual(TWO_ITEMS);
  });

  // ASK_QUANTITY, STOCK_EXCEEDED, CART y REMOVE_ITEM: chat-catalog-cart.test.ts (TK-05.2).
  test.todo('ESC-15 (pendiente, D-E) · `0` desde SUMMARY y RESOLVE_STOCK: TK-05.6');
});

describe('TK-05.1 · FSM · entrada inválida (ESC-16 parcial, D-E)', () => {
  test.each(['xyz', '', '   '])(
    'ESC-16 (CATALOG) · la entrada inválida %j responde con un mensaje y no cambia estado ni carrito',
    async (input) => {
      const session = makeSession('CATALOG', structuredClone(TWO_ITEMS));
      await reply(session, input);
      expect(session.state).toBe('CATALOG');
      expect(session.cart).toEqual(TWO_ITEMS);
    },
  );

  // ASK_QUANTITY, STOCK_EXCEEDED, CART y REMOVE_ITEM: chat-catalog-cart.test.ts (TK-05.2).
  // ESC-07 (contenido del catálogo): resuelto en tests/unit/chat/chat-catalog-cart.test.ts (ESC-17) y tests/db/chat-catalog-cart.test.ts (ESC-17, PostgreSQL).
  test.todo('ESC-16 (pendiente, D-E) · `xyz` en SUMMARY y RESOLVE_STOCK: TK-05.6');
});
