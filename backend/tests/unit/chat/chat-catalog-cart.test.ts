import { readFileSync } from 'node:fs';
import path from 'node:path';
import { handleChatMessage } from '../../../src/modules/chat/chat-fsm';
import {
  createFakeProducts,
  type FakeProduct,
  type FakeProducts,
  type FakeProductsService,
  priceRegex,
  PRODUCT_A,
  PRODUCT_B,
  PRODUCT_D,
} from '../../helpers/chat-products';

// TK-05.2 · Pruebas de aceptación de QA (fase 1): catálogo y carrito del chat (unidad, sin red ni base de datos).
// Spec 03 §4.2 (CATALOG, ASK_QUANTITY, STOCK_EXCEEDED, CART, REMOVE_ITEM), §4.3, F-3, F-4, F-5, §8, §10.3, §10.4, §10.7 (ESC-43);
// ESC-17, ESC-18, ESC-19, ESC-20, ESC-21, ESC-22 (nivel U), ESC-23, ESC-24, ESC-43 y heredados de TK-05.1: ESC-07, ESC-15, ESC-16.
// Decisiones de la puerta 1 (2026-11-26): D-1 (CART ofrece solo 1 Agregar otro producto y 2 Quitar ítem; sin confirmar; TK-05.6 la sustituye por D-G: `3` Confirmar compra),
// D-2 (catálogo numerado 1..N y `N+1) Ver carrito`; `0` sigue reservado), D-4 (lista, producto elegido y stock informado
// dentro de la propia sesión; aislamiento entre sesiones). La D-3 (barrido) se prueba en session-store-busy.test.ts.
//
// Supuestos de interfaz (docs/qa/TK-05.2-matrix.md):
//  - handleChatMessage(session, text, deps) con deps = { products }, donde `products` ofrece solo
//    listCatalog() y getAvailability(id) (ver tests/helpers/chat-products.ts). Devuelve (o promete) los textos del bot.
//  - Una línea del carrito tiene al menos { productId, quantity } (una por producto, sin precio: spec 03 §4.3).
//  - El contexto de la conversación (lista mostrada, producto elegido, stock informado) vive en el propio objeto de sesión que
//    recibe el FSM, con un tipo seguro declarado en el módulo del chat (por ejemplo, un tipo de sesión del chat que extiende el
//    del almacén). NO se añade ningún campo a ChatSession ni se cambia la interfaz pública de ChatSessionStore. Las pruebas
//    solo exigen que sea el mismo objeto `{ state, cart }` entre mensajes y que no haya estado global; lo ejercitan con mensajes.
// Los textos exactos los fija la implementación (spec 03 §4.2): las pruebas buscan "Sin stock", "vacío", "cantidad",
// "agotado" y "no disponible" y la numeración de las opciones (D-02, D-1, D-2), y comparan respuestas entre sí.
// Matriz: docs/qa/TK-05.2-matrix.md

type Session = Parameters<typeof handleChatMessage>[0];
type Deps = { products: FakeProductsService };
type Handle = (session: Session, text: string, deps: Deps) => Promise<string[]> | string[];
const handle = handleChatMessage as unknown as Handle;

const makeSession = (state: string = 'MAIN_MENU', cart: unknown[] = []): Session =>
  // TK-05.6: el FSM lee `customerId` de la sesión (confirmOrder); se añade con un cast para que el tipo compile antes y después.
  ({
    customerId: 1,
    state,
    cart,
  }) as unknown as Session;

interface Env {
  fake: FakeProducts;
  deps: Deps;
}
const makeEnv = (products: FakeProduct[] = [PRODUCT_A, PRODUCT_B]): Env => {
  const fake = createFakeProducts(products);
  return { fake, deps: { products: fake.service } };
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
const numbered = (n: number): RegExp => new RegExp(`^${n}\\)`);
const lineOf = (text: string, name: string): string | undefined => lines(text).find((l) => l.includes(name));

/** Número con el que la lista mostrada identifica al producto (la línea `N) nombre …`). */
function numberOf(text: string, name: string): number {
  const line = lines(text).find((l) => l.includes(name) && /^\d+\)/.test(l));
  if (!line) throw new Error(`no hay una línea numerada para "${name}" en:\n${text}`);
  return Number(/^(\d+)\)/.exec(line)![1]);
}

/** Líneas del carrito reducidas a lo que fija el supuesto de interfaz. */
const cartLines = (session: Session): { productId: number; quantity: number }[] =>
  (session.cart as unknown as { productId: number; quantity: number }[]).map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
  }));

/** Desde MAIN_MENU o CART: abre el catálogo, elige el producto por su número mostrado e indica la cantidad. Devuelve la respuesta a la cantidad. */
async function addToCart(env: Env, session: Session, product: FakeProduct, quantity: number | string): Promise<string> {
  const list = await say(env, session, '1'); // MAIN_MENU: Catálogo · CART: Agregar otro producto
  expect(session.state).toBe('CATALOG');
  await say(env, session, String(numberOf(list, product.name)));
  expect(session.state).toBe('ASK_QUANTITY');
  return say(env, session, String(quantity));
}

const NOT_AVAILABLE = /no (est[aá] )?disponible/i;
const EMPTY_CART = /vac[ií]o/i;

describe('TK-05.2 · FSM · CATALOG: lista (spec 03 F-4, CH-04, RN-10, D-2)', () => {
  test('ESC-17 · `1` en el menú lista A con precio y B con precio y "Sin stock", numerados, con `3) Ver carrito`; estado CATALOG, carrito intacto', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_B]);
    const session = makeSession('MAIN_MENU', [{ productId: 7, quantity: 1 }]);
    const cartBefore = structuredClone(session.cart);

    const text = await say(env, session, '1');

    expect(session.state).toBe('CATALOG');
    expect(session.cart).toEqual(cartBefore);
    const a = lineOf(text, PRODUCT_A.name);
    const b = lineOf(text, PRODUCT_B.name);
    expect(a).toMatch(numbered(1));
    expect(a).toMatch(priceRegex(PRODUCT_A.price));
    expect(a).not.toMatch(/Sin stock/i);
    expect(b).toMatch(numbered(2));
    expect(b).toMatch(priceRegex(PRODUCT_B.price));
    expect(b).toMatch(/Sin stock/);
    expect(lines(text).some((l) => /^3\)\s*Ver carrito/i.test(l))).toBe(true); // D-2: N+1
  });

  test('ESC-17 · el FSM respeta el orden de la lista que entrega el servicio (el servicio ordena por nombre)', async () => {
    const env = makeEnv([PRODUCT_D, PRODUCT_A]); // D antes que A, a propósito
    const text = await say(env, makeSession(), '1');
    expect(lineOf(text, PRODUCT_D.name)).toMatch(numbered(1));
    expect(lineOf(text, PRODUCT_A.name)).toMatch(numbered(2));
  });

  test('D-2 · con N productos, `Ver carrito` es la opción N+1 (aquí `5)`), y `0` no se usa para productos', async () => {
    const extra: FakeProduct = { id: 105, name: 'Bata desechable QA', price: '4000.00', currentStock: 6, isActive: true };
    const extra2: FakeProduct = { id: 106, name: 'Termómetro QA', price: '9000.00', currentStock: 3, isActive: true };
    const env = makeEnv([PRODUCT_A, PRODUCT_B, extra, extra2]);
    const text = await say(env, makeSession(), '1');
    expect(lines(text).some((l) => /^5\)\s*Ver carrito/i.test(l))).toBe(true);
    for (const l of lines(text)) expect(l).not.toMatch(/^0\)/);
  });

  test('ESC-17 · catálogo sin productos: responde y sigue en CATALOG; `0` vuelve al menú', async () => {
    const env = makeEnv([]);
    const session = makeSession();
    await say(env, session, '1');
    expect(session.state).toBe('CATALOG');
    await say(env, session, '0');
    expect(session.state).toBe('MAIN_MENU');
  });
});

describe('TK-05.2 · FSM · CATALOG: elección de producto (F-4, ESC-18, ESC-19, ESC-43, D-04, DP-01)', () => {
  test('ESC-18 · elegir B ("Sin stock") informa que no se puede elegir y repite la lista; sigue en CATALOG sin tocar el carrito', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_B]);
    const session = makeSession();
    const list = await say(env, session, '1');
    const reply = await say(env, session, String(numberOf(list, PRODUCT_B.name)));

    expect(session.state).toBe('CATALOG');
    expect(cartLines(session)).toEqual([]);
    expect(reply).not.toBe(list); // hay un aviso además de la lista
    expect(reply).toContain(PRODUCT_A.name); // repite la lista
    expect(reply).toMatch(/Ver carrito/i);
  });

  test.each(['7', '-1', 'abc', ''])(
    'ESC-19 · con 2 productos, la entrada %j es inválida: repite la lista, sigue en CATALOG, carrito sin cambios',
    async (input) => {
      const env = makeEnv([PRODUCT_A, PRODUCT_D]);
      const session = makeSession();
      await say(env, session, '1');
      const reply = await say(env, session, input);
      expect(session.state).toBe('CATALOG');
      expect(cartLines(session)).toEqual([]);
      expect(reply).toContain(PRODUCT_A.name);
      expect(reply).toContain(PRODUCT_D.name);
      expect(reply).toMatch(/Ver carrito/i);
    },
  );

  test('D-04 · los números se resuelven con la última lista mostrada: aunque el catálogo cambie, `1` sigue siendo A; la lista nueva solo rige tras volver a mostrarla', async () => {
    const newcomer: FakeProduct = { id: 110, name: 'Aposito estéril QA', price: '700.00', currentStock: 9, isActive: true };
    const env = makeEnv([PRODUCT_A, PRODUCT_D, newcomer]);
    env.fake.find(newcomer.id).isActive = false; // al mostrar la primera lista aún no existe
    const session = makeSession();
    const first = await say(env, session, '1');
    expect(numberOf(first, PRODUCT_A.name)).toBe(1);

    env.fake.find(newcomer.id).isActive = true;
    env.fake.products.unshift(env.fake.products.splice(env.fake.products.indexOf(env.fake.find(newcomer.id)), 1)[0]); // pasa a ser el nº 1 del catálogo vigente

    const asked = await say(env, session, '1'); // sin mostrar otra lista
    expect(session.state).toBe('ASK_QUANTITY');
    expect(asked).toContain(PRODUCT_A.name);
    expect(asked).not.toContain(newcomer.name);
    expect(env.fake.calls.filter((c) => c.startsWith('getAvailability:')).at(-1)).toBe(`getAvailability:${PRODUCT_A.id}`);

    await say(env, session, '2');
    expect(cartLines(session)).toEqual([{ productId: PRODUCT_A.id, quantity: 2 }]);

    const second = await say(env, session, '1'); // CART → Agregar otro: lista nueva con la numeración vigente
    expect(numberOf(second, newcomer.name)).toBe(1);
    const asked2 = await say(env, session, '1');
    expect(asked2).toContain(newcomer.name);
  });

  test('ESC-43 (a) · A se desactiva después de mostrar el catálogo: elegir A informa que no está disponible, no lo agrega y vuelve a CATALOG', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    const list = await say(env, session, '1');
    env.fake.find(PRODUCT_A.id).isActive = false;

    const reply = await say(env, session, String(numberOf(list, PRODUCT_A.name)));

    expect(reply).toMatch(NOT_AVAILABLE);
    expect(session.state).toBe('CATALOG');
    expect(cartLines(session)).toEqual([]);
    expect(reply).toMatch(/Ver carrito/i); // vuelve a mostrar el catálogo
  });

  test('ESC-43 (a) · un producto que el servicio ya no encuentra (null) se trata como no disponible', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    const list = await say(env, session, '1');
    env.fake.products.splice(env.fake.products.indexOf(env.fake.find(PRODUCT_A.id)), 1);
    const reply = await say(env, session, String(numberOf(list, PRODUCT_A.name)));
    expect(reply).toMatch(NOT_AVAILABLE);
    expect(session.state).toBe('CATALOG');
    expect(cartLines(session)).toEqual([]);
  });

  test('CH-05 · `Ver carrito` (N+1) con líneas lleva a CART y muestra cada producto con su cantidad', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    await addToCart(env, session, PRODUCT_A, 2);
    await say(env, session, '1'); // Agregar otro
    const reply = await say(env, session, '3'); // Ver carrito
    expect(session.state).toBe('CART');
    expect(lineOf(reply, PRODUCT_A.name)).toMatch(/\b2\b/);
  });
});

describe('TK-05.2 · FSM · ASK_QUANTITY (F-5, ESC-20, ESC-21, D-06, DP-01)', () => {
  test('CH-05 · elegir A (activo con stock) pasa a ASK_QUANTITY y pide la cantidad del producto elegido', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_B]);
    const session = makeSession();
    const list = await say(env, session, '1');
    const reply = await say(env, session, String(numberOf(list, PRODUCT_A.name)));
    expect(session.state).toBe('ASK_QUANTITY');
    expect(reply).toContain(PRODUCT_A.name);
    expect(reply).toMatch(/cantidad/i);
    expect(cartLines(session)).toEqual([]);
  });

  test('ESC-20 · A elegido con stock 10 y cantidad `3` → línea A × 3 en el carrito y estado CART', async () => {
    const env = makeEnv([PRODUCT_A]);
    const session = makeSession();
    const reply = await addToCart(env, session, PRODUCT_A, 3);
    expect(session.state).toBe('CART');
    expect(cartLines(session)).toEqual([{ productId: PRODUCT_A.id, quantity: 3 }]);
    expect(lineOf(reply, PRODUCT_A.name)).toMatch(/\b3\b/);
  });

  test('F-5 · cantidad igual al stock (10) se agrega; la cantidad con espacios alrededor (`  3  `) vale como 3', async () => {
    const env = makeEnv([PRODUCT_A]);
    const s1 = makeSession();
    await addToCart(env, s1, PRODUCT_A, 10);
    expect(s1.state).toBe('CART');
    expect(cartLines(s1)).toEqual([{ productId: PRODUCT_A.id, quantity: 10 }]);

    const s2 = makeSession();
    await addToCart(env, s2, PRODUCT_A, '  3  ');
    expect(s2.state).toBe('CART');
    expect(cartLines(s2)).toEqual([{ productId: PRODUCT_A.id, quantity: 3 }]);
  });

  test.each(['-2', '2.5', '2,5', '3.0', '1e1', '0x10', 'tres', '3 unidades', ''])(
    'ESC-21 · la cantidad %j es inválida: repite la pregunta de cantidad, sigue en ASK_QUANTITY y el carrito no cambia; luego `2` agrega A × 2',
    async (input) => {
      const env = makeEnv([PRODUCT_A, PRODUCT_D]);
      const session = makeSession();
      await addToCart(env, session, PRODUCT_D, 1); // carrito con D × 1
      const cartBefore = cartLines(session);
      const list = await say(env, session, '1');
      await say(env, session, String(numberOf(list, PRODUCT_A.name)));

      const reply = await say(env, session, input);
      expect(session.state).toBe('ASK_QUANTITY');
      expect(reply).toMatch(/cantidad/i);
      expect(cartLines(session)).toEqual(cartBefore);

      await say(env, session, '2'); // el producto elegido se conserva
      expect(session.state).toBe('CART');
      expect(cartLines(session)).toEqual([...cartBefore, { productId: PRODUCT_A.id, quantity: 2 }]);
    },
  );

  test.each(['99999999999999999999999', '9007199254740993'])(
    'ESC-21 · cantidad desmesurada %s: no rompe, no entra al carrito por encima del stock y, si se ofrece ajustar, queda en el stock (10)',
    async (input) => {
      const env = makeEnv([PRODUCT_A]);
      const session = makeSession();
      const list = await say(env, session, '1');
      await say(env, session, String(numberOf(list, PRODUCT_A.name)));
      await say(env, session, input);
      expect(['ASK_QUANTITY', 'STOCK_EXCEEDED']).toContain(session.state);
      expect(cartLines(session)).toEqual([]);
      if (session.state === 'STOCK_EXCEEDED') {
        await say(env, session, '1');
        expect(cartLines(session)).toEqual([{ productId: PRODUCT_A.id, quantity: 10 }]);
      }
    },
  );

  test('D-06 · el stock llegó a 0 antes de indicar la cantidad: informa que está agotado, vuelve a CATALOG, no agrega y no ofrece ajustar', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    const list = await say(env, session, '1');
    await say(env, session, String(numberOf(list, PRODUCT_A.name)));
    env.fake.find(PRODUCT_A.id).currentStock = 0;

    const reply = await say(env, session, '3');

    expect(reply).toMatch(/agotad|sin stock/i);
    expect(reply).not.toMatch(/ajustar/i);
    expect(session.state).toBe('CATALOG');
    expect(cartLines(session)).toEqual([]);
  });

  test('ESC-43 (b) · A se desactiva después de elegirlo y antes de indicar la cantidad (`3`): informa que no está disponible, no lo agrega y vuelve a CATALOG', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    const list = await say(env, session, '1');
    await say(env, session, String(numberOf(list, PRODUCT_A.name)));
    expect(session.state).toBe('ASK_QUANTITY');
    env.fake.find(PRODUCT_A.id).isActive = false;

    const reply = await say(env, session, '3');

    expect(reply).toMatch(NOT_AVAILABLE);
    expect(session.state).toBe('CATALOG');
    expect(cartLines(session)).toEqual([]);
  });

  test('ESC-15 · `0` en ASK_QUANTITY vuelve al menú, no es una cantidad y conserva el carrito; luego `3` en el menú no agrega nada', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    await addToCart(env, session, PRODUCT_D, 2);
    const cartBefore = cartLines(session);
    const list = await say(env, session, '1');
    await say(env, session, String(numberOf(list, PRODUCT_A.name)));

    const menu = await say(env, session, '0');
    expect(session.state).toBe('MAIN_MENU');
    expect(menu).toMatch(/1\)/);
    expect(cartLines(session)).toEqual(cartBefore);

    await say(env, session, '3');
    expect(session.state).toBe('MAIN_MENU');
    expect(cartLines(session)).toEqual(cartBefore);
  });
});

describe('TK-05.2 · FSM · STOCK_EXCEEDED (F-5, ESC-22, ESC-23, CA-04, D-05, D-4)', () => {
  const stock5: FakeProduct = { ...PRODUCT_A, currentStock: 5 };

  async function exceed(env: Env, session: Session, quantity: number | string = 8): Promise<string> {
    return addToCart(env, session, stock5, quantity);
  }

  test('ESC-22 · A con stock 5 y cantidad `8` → STOCK_EXCEEDED: ofrece ajustar a 5 (`1`) o descartar (`2`); el carrito no cambia', async () => {
    const env = makeEnv([stock5]);
    const session = makeSession();
    const reply = await exceed(env, session);
    expect(session.state).toBe('STOCK_EXCEEDED');
    expect(reply).toMatch(/\b5\b/);
    expect(lines(reply).some((l) => /^1\)/.test(l))).toBe(true);
    expect(lines(reply).some((l) => /^2\)/.test(l))).toBe(true);
    expect(lines(reply).some((l) => /^3\)/.test(l))).toBe(false);
    expect(cartLines(session)).toEqual([]);
  });

  test.each([
    [5, 'CART'],
    [6, 'STOCK_EXCEEDED'],
  ])('ESC-22 · límite: con stock 5, la cantidad %i → %s', async (quantity, state) => {
    const env = makeEnv([stock5]);
    const session = makeSession();
    await exceed(env, session, quantity);
    expect(session.state).toBe(state);
  });

  test('ESC-22 · `1` (ajustar) deja la línea A × 5 y pasa a CART', async () => {
    const env = makeEnv([stock5]);
    const session = makeSession();
    await exceed(env, session);
    const reply = await say(env, session, '1');
    expect(session.state).toBe('CART');
    expect(cartLines(session)).toEqual([{ productId: stock5.id, quantity: 5 }]);
    expect(lineOf(reply, stock5.name)).toMatch(/\b5\b/);
  });

  test('ESC-22 · `2` (descartar), en otra conversación: no hay línea de A y vuelve a CATALOG', async () => {
    const env = makeEnv([stock5, PRODUCT_D]);
    const session = makeSession();
    await exceed(env, session);
    const reply = await say(env, session, '2');
    expect(session.state).toBe('CATALOG');
    expect(cartLines(session)).toEqual([]);
    expect(reply).toMatch(/Ver carrito/i);
  });

  test('D-4 · el stock informado (5) se guarda en la sesión: si el stock baja a 3 después, ajustar deja la línea en el valor informado (la confirmación revalida, RN-02)', async () => {
    const env = makeEnv([stock5]);
    const session = makeSession();
    await exceed(env, session);
    env.fake.find(stock5.id).currentStock = 3;
    await say(env, session, '1');
    expect(cartLines(session)).toEqual([{ productId: stock5.id, quantity: 5 }]);
  });

  test.each(['xyz', '3', ''])(
    'ESC-16 · la entrada inválida %j en STOCK_EXCEEDED repite las dos opciones sin cambiar estado ni carrito',
    async (input) => {
      const env = makeEnv([stock5]);
      const session = makeSession();
      await exceed(env, session);
      const reply = await say(env, session, input);
      expect(session.state).toBe('STOCK_EXCEEDED');
      expect(cartLines(session)).toEqual([]);
      expect(lines(reply).some((l) => /^1\)/.test(l))).toBe(true);
      expect(lines(reply).some((l) => /^2\)/.test(l))).toBe(true);
    },
  );

  test('ESC-15 · `0` en STOCK_EXCEEDED vuelve al menú conservando el carrito', async () => {
    const env = makeEnv([stock5, PRODUCT_D]);
    const session = makeSession();
    await addToCart(env, session, PRODUCT_D, 2);
    const cartBefore = cartLines(session);
    await exceed(env, session);
    expect(session.state).toBe('STOCK_EXCEEDED');
    const menu = await say(env, session, '0');
    expect(session.state).toBe('MAIN_MENU');
    expect(menu).toMatch(/1\)\s*Cat[aá]logo/i);
    expect(cartLines(session)).toEqual(cartBefore);
  });

  test('ESC-23 · carrito con A × 3 (stock 5): pedir `1` más suma en la misma línea (A × 4); pedir `4` más → 8 > 5: ajustar deja A × 5', async () => {
    const env = makeEnv([stock5]);
    const session = makeSession();
    await addToCart(env, session, stock5, 3);
    await addToCart(env, session, stock5, 1);
    expect(session.state).toBe('CART');
    expect(cartLines(session)).toEqual([{ productId: stock5.id, quantity: 4 }]); // una línea por producto (US-05 crit. 5)

    const reply = await addToCart(env, session, stock5, 4);
    expect(session.state).toBe('STOCK_EXCEEDED');
    expect(reply).toMatch(/\b5\b/);
    expect(cartLines(session)).toEqual([{ productId: stock5.id, quantity: 4 }]); // aún sin cambios

    await say(env, session, '1');
    expect(session.state).toBe('CART');
    expect(cartLines(session)).toEqual([{ productId: stock5.id, quantity: 5 }]);
  });

  test('ESC-23 · el mismo caso en otra conversación: descartar deja la línea en A × 4 y vuelve a CATALOG', async () => {
    const env = makeEnv([stock5]);
    const session = makeSession();
    await addToCart(env, session, stock5, 3);
    await addToCart(env, session, stock5, 1);
    await addToCart(env, session, stock5, 4);
    expect(session.state).toBe('STOCK_EXCEEDED');
    await say(env, session, '2');
    expect(session.state).toBe('CATALOG');
    expect(cartLines(session)).toEqual([{ productId: stock5.id, quantity: 4 }]);
  });
});

describe('TK-05.2 · FSM · CART y REMOVE_ITEM (F-5, §4.3, ESC-24, D-1)', () => {
  test('D-G (antes D-1, cambio previsto en TK-05.6) · CART muestra cada línea con producto y cantidad y ofrece `1` Agregar otro producto, `2` Quitar ítem y `3` Confirmar compra', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    await addToCart(env, session, PRODUCT_A, 2);
    const reply = await addToCart(env, session, PRODUCT_D, 5);
    expect(session.state).toBe('CART');
    expect(lineOf(reply, PRODUCT_A.name)).toMatch(/\b2\b/);
    expect(lineOf(reply, PRODUCT_D.name)).toMatch(/\b5\b/);
    expect(lines(reply).some((l) => /^1\)\s*Agregar/i.test(l))).toBe(true);
    expect(lines(reply).some((l) => /^2\)\s*Quitar/i.test(l))).toBe(true);
    expect(lines(reply).some((l) => /^3\)\s*Confirmar/i.test(l))).toBe(true);
    expect(lines(reply).some((l) => /^4\)/.test(l))).toBe(false);
  });

  test.each(['4', 'xyz', ''])(
    'D-G / ESC-16 · en CART con líneas, la entrada %j es inválida: repite el carrito y sus tres opciones; no pasa a SUMMARY ni cambia el carrito',
    async (input) => {
      const env = makeEnv([PRODUCT_A]);
      const session = makeSession();
      await addToCart(env, session, PRODUCT_A, 2);
      const reply = await say(env, session, input);
      expect(session.state).toBe('CART');
      expect(cartLines(session)).toEqual([{ productId: PRODUCT_A.id, quantity: 2 }]);
      expect(reply).toContain(PRODUCT_A.name);
      expect(lines(reply).some((l) => /^1\)\s*Agregar/i.test(l))).toBe(true);
      expect(lines(reply).some((l) => /^2\)\s*Quitar/i.test(l))).toBe(true);
      expect(lines(reply).some((l) => /^3\)\s*Confirmar/i.test(l))).toBe(true);
    },
  );

  test('CH-05 · `1` en CART (Agregar otro producto) vuelve al catálogo con la lista vigente', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    await addToCart(env, session, PRODUCT_A, 2);
    const reply = await say(env, session, '1');
    expect(session.state).toBe('CATALOG');
    expect(reply).toContain(PRODUCT_D.name);
    expect(reply).toMatch(/Ver carrito/i);
    expect(cartLines(session)).toEqual([{ productId: PRODUCT_A.id, quantity: 2 }]);
  });

  test('§4.3 · carrito vacío en CART: informa que está vacío; `2` (Quitar) no pasa a REMOVE_ITEM; `1` vuelve a CATALOG', async () => {
    const env = makeEnv([PRODUCT_A]);
    const session = makeSession();
    await say(env, session, '1');
    const empty = await say(env, session, '2'); // N = 1 → `2` es Ver carrito
    expect(session.state).toBe('CART');
    expect(empty).toMatch(EMPTY_CART);

    const again = await say(env, session, '2');
    expect(session.state).toBe('CART');
    expect(again).toMatch(EMPTY_CART);

    await say(env, session, '1');
    expect(session.state).toBe('CATALOG');
  });

  test('ESC-24 · carrito con A × 2 y B × 1: `2` (Quitar) lista las líneas numeradas; quitar la de A deja solo B; quitar la de B lo deja vacío', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    await addToCart(env, session, PRODUCT_A, 2);
    await addToCart(env, session, PRODUCT_D, 1);
    expect(cartLines(session)).toEqual([
      { productId: PRODUCT_A.id, quantity: 2 },
      { productId: PRODUCT_D.id, quantity: 1 },
    ]);

    const remove = await say(env, session, '2');
    expect(session.state).toBe('REMOVE_ITEM');
    expect(lineOf(remove, PRODUCT_A.name)).toMatch(numbered(1));
    expect(lineOf(remove, PRODUCT_D.name)).toMatch(numbered(2));

    const afterFirst = await say(env, session, '1'); // quita la línea de A
    expect(session.state).toBe('CART');
    expect(cartLines(session)).toEqual([{ productId: PRODUCT_D.id, quantity: 1 }]);
    expect(afterFirst).toContain(PRODUCT_D.name);
    expect(afterFirst).not.toContain(PRODUCT_A.name);

    const remove2 = await say(env, session, '2');
    expect(session.state).toBe('REMOVE_ITEM');
    expect(lineOf(remove2, PRODUCT_D.name)).toMatch(numbered(1));
    const afterSecond = await say(env, session, '1'); // quita la línea de B
    expect(session.state).toBe('CART');
    expect(cartLines(session)).toEqual([]);
    expect(afterSecond).toMatch(EMPTY_CART);
  });

  test('ESC-24 · quitar una línea no altera las demás (se quita la segunda, queda la primera con su cantidad)', async () => {
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    const session = makeSession();
    await addToCart(env, session, PRODUCT_A, 2);
    await addToCart(env, session, PRODUCT_D, 7);
    await say(env, session, '2');
    await say(env, session, '2');
    expect(session.state).toBe('CART');
    expect(cartLines(session)).toEqual([{ productId: PRODUCT_A.id, quantity: 2 }]);
  });

  test.each(['9', '-1', 'abc'])(
    'ESC-16 · en REMOVE_ITEM con 2 líneas, la entrada %j es inválida: repite la lista de líneas; estado y carrito sin cambios',
    async (input) => {
      const env = makeEnv([PRODUCT_A, PRODUCT_D]);
      const session = makeSession();
      await addToCart(env, session, PRODUCT_A, 2);
      await addToCart(env, session, PRODUCT_D, 1);
      await say(env, session, '2');
      const cartBefore = cartLines(session);
      const reply = await say(env, session, input);
      expect(session.state).toBe('REMOVE_ITEM');
      expect(cartLines(session)).toEqual(cartBefore);
      expect(lineOf(reply, PRODUCT_A.name)).toMatch(numbered(1));
      expect(lineOf(reply, PRODUCT_D.name)).toMatch(numbered(2));
    },
  );

  test.each(['CART', 'REMOVE_ITEM'])(
    'ESC-15 · con 2 ítems en el carrito, `0` desde %s → MAIN_MENU con el menú y el carrito intacto',
    async (state) => {
      const env = makeEnv([PRODUCT_A, PRODUCT_D]);
      const session = makeSession();
      await addToCart(env, session, PRODUCT_A, 2);
      await addToCart(env, session, PRODUCT_D, 1);
      if (state === 'REMOVE_ITEM') await say(env, session, '2');
      expect(session.state).toBe(state);
      const cartBefore = cartLines(session);

      const menu = await say(env, session, '0');

      expect(session.state).toBe('MAIN_MENU');
      expect(menu).toMatch(/1\)\s*Cat[aá]logo/i);
      expect(menu).toMatch(/2\)\s*Mis pedidos/i);
      expect(cartLines(session)).toEqual(cartBefore);
    },
  );

});

describe('TK-05.2 · FSM · aislamiento entre sesiones (D-4, D-04, DP-09, ESC-46)', () => {
  test('D-4 · dos sesiones con catálogos y selecciones distintas no se mezclan: cada `1` resuelve contra la lista de SU sesión', async () => {
    const newcomer: FakeProduct = { id: 120, name: 'Aposito estéril QA', price: '700.00', currentStock: 9, isActive: true };
    const env = makeEnv([PRODUCT_A, PRODUCT_D]);
    env.fake.products.push({ ...newcomer, isActive: false });
    const s1 = makeSession();
    const s2 = makeSession();

    const list1 = await say(env, s1, '1'); // [A, D]
    expect(numberOf(list1, PRODUCT_A.name)).toBe(1);
    env.fake.find(newcomer.id).isActive = true;
    env.fake.products.unshift(env.fake.products.pop()!); // el catálogo vigente pasa a [aposito, A, D]
    const list2 = await say(env, s2, '1');
    expect(numberOf(list2, newcomer.name)).toBe(1);

    const asked1 = await say(env, s1, '1');
    const asked2 = await say(env, s2, '1');
    expect(asked1).toContain(PRODUCT_A.name);
    expect(asked2).toContain(newcomer.name);

    await say(env, s2, '3');
    await say(env, s1, '2');
    expect(s1.state).toBe('CART');
    expect(s2.state).toBe('CART');
    expect(cartLines(s1)).toEqual([{ productId: PRODUCT_A.id, quantity: 2 }]);
    expect(cartLines(s2)).toEqual([{ productId: newcomer.id, quantity: 3 }]);
  });

  test('D-4 · el producto elegido y el stock informado de una sesión no afectan a otra: S1 en STOCK_EXCEEDED por A (stock 5), S2 pide A × 2 y entra', async () => {
    const stock5: FakeProduct = { ...PRODUCT_A, currentStock: 5 };
    const env = makeEnv([stock5, PRODUCT_D]);
    const s1 = makeSession();
    const s2 = makeSession();
    const l1 = await say(env, s1, '1');
    await say(env, s1, String(numberOf(l1, stock5.name)));
    await say(env, s1, '8');
    expect(s1.state).toBe('STOCK_EXCEEDED');

    await addToCart(env, s2, PRODUCT_D, 4);
    expect(cartLines(s2)).toEqual([{ productId: PRODUCT_D.id, quantity: 4 }]);

    await say(env, s1, '1'); // ajustar: usa el producto y el stock de s1
    expect(cartLines(s1)).toEqual([{ productId: stock5.id, quantity: 5 }]);
    expect(cartLines(s2)).toEqual([{ productId: PRODUCT_D.id, quantity: 4 }]);
  });
});

describe('TK-05.2 · FSM · no consulta Prisma (Hecho cuando 1)', () => {
  test('el motor del chat no importa Prisma ni el cliente generado: la disponibilidad sale del servicio de productos', () => {
    const source = readFileSync(path.resolve(__dirname, '../../../src/modules/chat/chat-fsm.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"][^'"]*prisma/i);
    expect(source).not.toMatch(/require\(['"][^'"]*prisma/i);
    expect(source).not.toMatch(/\$queryRaw|\$transaction/);
  });
});
