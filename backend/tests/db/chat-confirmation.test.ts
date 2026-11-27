import request, { type Response } from 'supertest';
import type { Express } from 'express';
import { createApp, type CreateAppOptions } from '../../src/app';
import { ChatSessionStore } from '../../src/modules/chat/session-store';
import { createOrderService, OrderInputError } from '../../src/modules/orders/orders.service';
import { captureOutput } from '../helpers/capture-output';
import { priceRegex } from '../helpers/chat-products';
import { QA_JWT_SECRET, validTestToken } from '../helpers/jwt';
import { orderCounts, persistedOrders, stockOf } from './helpers/orders';
import { connectTestPrisma, type Db, insertProduct, PRODUCTS } from './helpers/products';

// TK-05.6 · Pruebas de aceptación de QA (fase 1): resumen y confirmación del pedido en el chat a través de los endpoints, contra PostgreSQL
// real (medsupply_test, RNF-01). Spec 03 F-6, F-7 ("Cierre de la confirmación"), §8, §9, §10.5, §10.7; ESC-28, ESC-29, ESC-30, ESC-31, ESC-33,
// ESC-34, ESC-37, ESC-48 y D7 de TK-05.3 (errores internos al confirmar). Contrato docs/openapi.yaml: sendChatMessage (sin cambios).
// Alcance acotado a lo que necesita PostgreSQL: la atomicidad, el ROLLBACK, los reintentos y el precio congelado ya están verificados en TK-05.3
// (tests/db/orders-confirm*.test.ts) y no se repiten; la concurrencia (ESC-35, ESC-36) y los E2E son de TK-05.5; el resto de escenarios y las
// ramas de F-7 se prueban en tests/unit/chat/chat-confirmation.test.ts.
// Datos propios: la limpieza global de test:db vacía la base antes de cada test. El operador (desactivar, editar precio, ajustar stock) actúa por los
// endpoints reales de productos con un JWT de prueba; "otro cliente deja el stock en N" se simula con una actualización directa del stock.
//
// Supuestos de interfaz (docs/qa/TK-05.6-matrix.md): CreateAppOptions gana dos opciones OPCIONALES, como ya hizo `chatProducts` (TK-05.2):
//   chatOrders?: Pick<OrderService, 'confirmOrder'>                         servicio de pedidos que consume el chat (por defecto, createOrderService({ prisma }))
//   chatConfirmedOrderMessage?: (order: ConfirmedOrder) => string[]         D-C: construye el mensaje del pedido confirmado (por defecto, número y PENDING)
// Los textos exactos los fija la implementación: se buscan fragmentos estables (número `MED-` + 5 o más dígitos, "PENDING", "no disponible",
// las cifras y la numeración de opciones).
// Matriz: docs/qa/TK-05.6-matrix.md

type Store = NonNullable<CreateAppOptions['chatSessionStore']>;
type ConfirmOrder = ReturnType<typeof createOrderService>['confirmOrder'];

const ACTIVE_PHONE = '+56912345678';
const NOT_AVAILABLE = /no (est[aá] )?disponible/i;
const ORDER_NUMBER = /MED-\d{5,}/;
const INTERNAL_ERROR_BODY = { error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' } };

let db: Db;

beforeAll(async () => {
  db = await connectTestPrisma();
});
afterAll(async () => {
  await db?.$disconnect();
});

interface Overrides {
  chatOrders?: { confirmOrder: ConfirmOrder };
  chatConfirmedOrderMessage?: (order: unknown) => string[];
}

function build(overrides: Overrides = {}): { app: Express; store: Store } {
  const store: Store = new ChatSessionStore({ ttlMinutes: 30 });
  const options = { auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' }, prisma: db, chatSessionStore: store, ...overrides };
  const app = createApp(options as unknown as CreateAppOptions);
  return { app, store };
}

const startSession = (app: Express) =>
  request(app).post('/api/v1/chat/sessions').set('Content-Type', 'application/json').send(JSON.stringify({ phone: ACTIVE_PHONE }));
const sendMessage = (app: Express, id: string, text: string) =>
  request(app).post(`/api/v1/chat/sessions/${id}/messages`).set('Content-Type', 'application/json').send(JSON.stringify({ text }));

const operator = () => `Bearer ${validTestToken('1')}`;
const deactivate = (app: Express, productId: number) => request(app).post(`${PRODUCTS}/${productId}/deactivate`).set('Authorization', operator());
const patchProduct = (app: Express, productId: number, body: unknown) =>
  request(app).patch(`${PRODUCTS}/${productId}`).set('Authorization', operator()).set('Content-Type', 'application/json').send(JSON.stringify(body));

async function seedCustomer(): Promise<number> {
  const c = await db.customer.create({ data: { businessName: 'Clínica Los Andes', taxId: '76.111.111-1', phone: ACTIVE_PHONE, isActive: true } });
  return c.id;
}

async function openSession(app: Express): Promise<string> {
  const res = await startSession(app);
  expect(res.status).toBe(201);
  return res.body.sessionId as string;
}

/** Envía un mensaje, exige 200 con la forma de ChatReply y devuelve el texto del bot. */
async function say(app: Express, id: string, text: string): Promise<string> {
  const res: Response = await sendMessage(app, id, text);
  expect(res.status).toBe(200);
  expect(Object.keys(res.body).sort()).toEqual(['active', 'messages', 'sessionId']);
  expect(res.body.active).toBe(true);
  expect(res.body.sessionId).toBe(id);
  expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
  return (res.body.messages as { text: string }[]).map((m) => m.text).join('\n');
}

const lines = (text: string): string[] => text.split('\n').map((l) => l.trim());
const lineOf = (text: string, name: string): string | undefined => lines(text).find((l) => l.includes(name));
const totalLine = (text: string): string | undefined => lines(text).find((l) => /total/i.test(l));
const hasOption = (text: string, n: number, word: RegExp): boolean => lines(text).some((l) => new RegExp(`^${n}\\)`).test(l) && word.test(l));
function numberOf(text: string, name: string): number {
  const line = lines(text).find((l) => l.includes(name) && /^\d+\)/.test(l));
  if (!line) throw new Error(`no hay una línea numerada para "${name}" en:\n${text}`);
  return Number(/^(\d+)\)/.exec(line)![1]);
}
const cartOf = (store: Store, id: string): { productId: number; quantity: number }[] =>
  (store.get(id)!.cart as unknown as { productId: number; quantity: number }[]).map((l) => ({ productId: l.productId, quantity: l.quantity }));

/** Desde MAIN_MENU o CART: abre el catálogo, elige por el número mostrado e indica la cantidad. */
async function addToCart(app: Express, id: string, name: string, quantity: number): Promise<void> {
  const list = await say(app, id, '1');
  await say(app, id, String(numberOf(list, name)));
  await say(app, id, String(quantity));
}

/** En CART con líneas: `3` (Confirmar compra, D-G) muestra el resumen. */
async function showSummary(app: Express, store: Store, id: string): Promise<string> {
  const text = await say(app, id, '3');
  expect(store.get(id)?.state).toBe('SUMMARY');
  return text;
}

const A = { name: 'Alcohol gel QA', price: '100.00' };
const B = { name: 'Bata desechable QA', price: '50.00' };
const C = { name: 'Casco de seguridad QA', price: '40.00' };

describe('TK-05.6 · ESC-28 / ESC-34 / CA-03 · pedido confirmado desde el chat (CH-07, RN-03, RN-04)', () => {
  test('ESC-28 · A × 2 (100.00) y B × 1 (50.00): el resumen no crea pedido; `1` responde con número MED- y PENDING; pedido PENDING con ítems a 100.00 y 50.00, total 250.00, stock 8 y 4; carrito vacío y MAIN_MENU', async () => {
    const customerId = await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const b = await insertProduct(db, { ...B, currentStock: 5 });
    const { app, store } = build();
    const id = await openSession(app);
    await addToCart(app, id, A.name, 2);
    await addToCart(app, id, B.name, 1);

    const summary = await showSummary(app, store, id);
    expect(lineOf(summary, A.name)).toMatch(priceRegex('200.00'));
    expect(lineOf(summary, B.name)).toMatch(priceRegex('50.00'));
    expect(totalLine(summary)).toMatch(priceRegex('250.00'));
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 }); // el resumen no crea nada
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 });

    const text = await say(app, id, '1');

    expect(text).toMatch(ORDER_NUMBER);
    expect(text).toContain('PENDING');
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ customer_id: customerId, status: 'PENDING', total_amount: '250.00' });
    expect(orders[0].order_number).toMatch(/^MED-\d{5,}$/);
    expect(text).toContain(orders[0].order_number);
    expect(orders[0].items).toEqual([
      { product_id: a, quantity: 2, unit_price: '100.00' },
      { product_id: b, quantity: 1, unit_price: '50.00' },
    ]);
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 8, [b]: 4 });
    expect(store.get(id)?.state).toBe('MAIN_MENU');
    expect(cartOf(store, id)).toEqual([]);
  });

  test('ESC-34 · tras el pedido, repetir `1` muestra el catálogo; sigue existiendo un solo pedido y el stock no vuelve a bajar', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const { app, store } = build();
    const id = await openSession(app);
    await addToCart(app, id, A.name, 2);
    await showSummary(app, store, id);
    await say(app, id, '1');
    expect(await orderCounts(db)).toMatchObject({ orders: 1 });

    const text = await say(app, id, '1');

    expect(store.get(id)?.state).toBe('CATALOG');
    expect(text).toContain(A.name);
    expect(await orderCounts(db)).toMatchObject({ orders: 1 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 8 });
  });
});

describe('TK-05.6 · ESC-29 / ESC-30 / ESC-31 / ESC-33 · rechazos de la confirmación contra PostgreSQL (RN-02, RN-03, CA-05, CA-14, CA-15, DP-02, DP-03)', () => {
  test('ESC-29 · A × 4 y otro cliente deja el stock de A en 2: `1` no crea pedido y ofrece ajustar/quitar/cancelar; ajustar deja A × 2 con un nuevo resumen que exige confirmar; confirmar crea el pedido', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const { app, store } = build();
    const id = await openSession(app);
    await addToCart(app, id, A.name, 4);
    await showSummary(app, store, id);
    await db.product.update({ where: { id: a }, data: { currentStock: 2 } }); // otro cliente compró 8 unidades

    const text = await say(app, id, '1');

    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 2 });
    expect(store.get(id)?.state).toBe('RESOLVE_STOCK');
    expect(text).toContain(A.name);
    expect(hasOption(text, 1, /ajustar/i)).toBe(true);
    expect(hasOption(text, 2, /quitar/i)).toBe(true);
    expect(hasOption(text, 3, /cancelar/i)).toBe(true);

    const summary = await say(app, id, '1');
    expect(store.get(id)?.state).toBe('SUMMARY');
    expect(cartOf(store, id)).toEqual([{ productId: a, quantity: 2 }]);
    expect(totalLine(summary)).toMatch(priceRegex('200.00'));
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 }); // exige una confirmación nueva

    await say(app, id, '1');
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toEqual([{ product_id: a, quantity: 2, unit_price: '100.00' }]);
    expect(await stockOf(db, [a])).toEqual({ [a]: 0 });
  });

  test('ESC-30 · A y B; el operador desactiva B tras mostrar el resumen: `1` no crea pedido ni cambia stock, informa que B ya no está disponible, lo retira y muestra un nuevo resumen con A; la segunda `1` crea el pedido solo con A', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const b = await insertProduct(db, { ...B, currentStock: 5 });
    const { app, store } = build();
    const id = await openSession(app);
    await addToCart(app, id, A.name, 1);
    await addToCart(app, id, B.name, 1);
    await showSummary(app, store, id);
    expect((await deactivate(app, b)).status).toBe(200);

    const text = await say(app, id, '1');

    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 });
    expect(text).toMatch(NOT_AVAILABLE);
    expect(text).toContain(B.name);
    expect(cartOf(store, id)).toEqual([{ productId: a, quantity: 1 }]);
    expect(store.get(id)?.state).toBe('SUMMARY');
    expect(lineOf(text, A.name)).toMatch(priceRegex('100.00'));
    expect(totalLine(text)).toMatch(priceRegex('100.00'));
    expect(hasOption(text, 1, /confirmar/i)).toBe(true);

    await say(app, id, '1');
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toEqual([{ product_id: a, quantity: 1, unit_price: '100.00' }]);
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 9, [b]: 5 });
  });

  test('ESC-31 · A × 2 mostrado a 100.00 y el operador lo cambia a 120.00: `1` no crea pedido ni cambia stock y muestra un nuevo resumen con 120.00; la segunda `1` crea el pedido con unitPrice 120.00', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const { app, store } = build();
    const id = await openSession(app);
    await addToCart(app, id, A.name, 2);
    await showSummary(app, store, id);
    expect((await patchProduct(app, a, { price: '120.00' })).status).toBe(200);

    const text = await say(app, id, '1');

    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 10 });
    expect(store.get(id)?.state).toBe('SUMMARY');
    expect(lineOf(text, A.name)).toMatch(priceRegex('240.00'));
    expect(totalLine(text)).toMatch(priceRegex('240.00'));
    expect(text).not.toMatch(ORDER_NUMBER);

    await say(app, id, '1');
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ total_amount: '240.00' });
    expect(orders[0].items).toEqual([{ product_id: a, quantity: 2, unit_price: '120.00' }]);
    expect(await stockOf(db, [a])).toEqual({ [a]: 8 });
  });

  test('ESC-33 · A inactivo, B × 4 con stock 2 y C con precio cambiado: inactivos → stock → nuevo resumen; la tercera `1` crea el pedido solo con B × 2 y C al precio vigente', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const b = await insertProduct(db, { ...B, currentStock: 10 });
    const c = await insertProduct(db, { ...C, currentStock: 10 });
    const { app, store } = build();
    const id = await openSession(app);
    await addToCart(app, id, A.name, 1);
    await addToCart(app, id, B.name, 4);
    await addToCart(app, id, C.name, 1);
    await showSummary(app, store, id);
    expect((await deactivate(app, a)).status).toBe(200);
    await db.product.update({ where: { id: b }, data: { currentStock: 2 } });
    expect((await patchProduct(app, c, { price: '45.00' })).status).toBe(200);

    const first = await say(app, id, '1');

    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a, b, c])).toEqual({ [a]: 10, [b]: 2, [c]: 10 });
    expect(first).toMatch(NOT_AVAILABLE);
    expect(first.indexOf(A.name)).toBeGreaterThanOrEqual(0);
    expect(first.indexOf(A.name)).toBeLessThan(first.indexOf(B.name)); // DP-03: inactivos antes que stock
    expect(store.get(id)?.state).toBe('RESOLVE_STOCK');
    expect(cartOf(store, id)).toEqual([{ productId: b, quantity: 4 }, { productId: c, quantity: 1 }]);

    const summary = await say(app, id, '1'); // ajusta B a 2
    expect(store.get(id)?.state).toBe('SUMMARY');
    expect(lineOf(summary, B.name)).toMatch(priceRegex('100.00'));
    expect(lineOf(summary, C.name)).toMatch(priceRegex('45.00'));
    expect(totalLine(summary)).toMatch(priceRegex('145.00'));
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });

    await say(app, id, '1');
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ total_amount: '145.00' });
    expect(orders[0].items).toEqual([
      { product_id: b, quantity: 2, unit_price: '50.00' },
      { product_id: c, quantity: 1, unit_price: '45.00' },
    ]);
    expect(await stockOf(db, [a, b, c])).toEqual({ [a]: 10, [b]: 0, [c]: 9 });
  });
});

describe('TK-05.6 · ESC-37 / D7 · error interno al confirmar sin pedido creado (DP-07, RNF-03)', () => {
  /** Servicio de pedidos que falla en la primera llamada y luego delega en el real (el ROLLBACK real ya está probado en TK-05.3). */
  function failsOnce(error: Error): { orders: { confirmOrder: ConfirmOrder }; calls: () => number } {
    const real = createOrderService({ prisma: db });
    let calls = 0;
    const confirmOrder: ConfirmOrder = async (input) => {
      calls += 1;
      if (calls === 1) throw error;
      return real.confirmOrder(input);
    };
    return { orders: { confirmOrder }, calls: () => calls };
  }

  test('ESC-37 · la primera `1` falla con un error no controlado: 500 INTERNAL_ERROR con el cuerpo genérico exacto y sin detalles internos; sin pedido ni cambio de stock; sigue en SUMMARY con carrito; la segunda `1` crea exactamente un pedido', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const secret = 'detalle-interno-secreto-QA conexión rota postgres://usuario:clave@host';
    const failing = failsOnce(new Error(secret));
    const { app, store } = build({ chatOrders: failing.orders });
    const id = await openSession(app);
    await addToCart(app, id, A.name, 2);
    await showSummary(app, store, id);
    const out = captureOutput();

    let res: Response;
    try {
      res = await sendMessage(app, id, '1');
    } finally {
      out.restore();
    }

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_ERROR_BODY);
    expect(JSON.stringify(res.body)).not.toContain('secreto');
    expect(out.all()).not.toContain('secreto'); // el registro del servidor tampoco lleva el mensaje original
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 10 });
    expect(store.get(id)?.state).toBe('SUMMARY');
    expect(cartOf(store, id)).toEqual([{ productId: a, quantity: 2 }]);

    const text = await say(app, id, '1'); // reintento
    expect(failing.calls()).toBe(2);
    expect(text).toMatch(ORDER_NUMBER);
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toEqual([{ product_id: a, quantity: 2, unit_price: '100.00' }]);
    expect(await stockOf(db, [a])).toEqual({ [a]: 8 });
    expect(store.get(id)?.state).toBe('MAIN_MENU');
    expect(cartOf(store, id)).toEqual([]);
  });

  test('ESC-37 · el reintento revalida con los precios mostrados originalmente: si el operador cambió el precio tras el error, el reintento recibe PRICE_CHANGED (nuevo resumen, sin pedido) y no hay duplicados', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const { app, store } = build({ chatOrders: failsOnce(new Error('fallo inyectado QA TK-05.6')).orders });
    const id = await openSession(app);
    await addToCart(app, id, A.name, 2);
    await showSummary(app, store, id);
    const out = captureOutput();
    try {
      expect((await sendMessage(app, id, '1')).status).toBe(500);
    } finally {
      out.restore();
    }
    expect((await patchProduct(app, a, { price: '120.00' })).status).toBe(200);

    const text = await say(app, id, '1');

    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(store.get(id)?.state).toBe('SUMMARY');
    expect(totalLine(text)).toMatch(priceRegex('240.00'));

    await say(app, id, '1');
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0].items).toEqual([{ product_id: a, quantity: 2, unit_price: '120.00' }]);
  });

  test('D7 · OrderInputError de orders.service (producto inexistente tras mostrar el resumen, D5 de TK-05.3): 500 INTERNAL_ERROR genérico sin detalles; sin pedido; la sesión conserva SUMMARY, el carrito y los precios mostrados', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const b = await insertProduct(db, { ...B, currentStock: 5 });
    const { app, store } = build(); // servicio de pedidos real
    const id = await openSession(app);
    await addToCart(app, id, A.name, 1);
    await addToCart(app, id, B.name, 1);
    await showSummary(app, store, id);
    await db.product.delete({ where: { id: b } }); // el producto desaparece: orders.service lanza OrderInputError('El producto no existe.')
    const out = captureOutput();

    let res: Response;
    try {
      res = await sendMessage(app, id, '1');
    } finally {
      out.restore();
    }

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_ERROR_BODY);
    expect(JSON.stringify(res.body)).not.toMatch(/existe|OrderInput/i);
    expect(out.all()).not.toContain('no existe');
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 10 });
    expect(store.get(id)?.state).toBe('SUMMARY');
    expect(cartOf(store, id)).toEqual([{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }]);
  });

  test('D7 · un OrderInputError lanzado por el servicio (entrada inválida) también responde 500 INTERNAL_ERROR genérico y conserva SUMMARY y el carrito', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const failing = failsOnce(new OrderInputError('El precio mostrado no tiene el formato esperado. (detalle interno)'));
    const { app, store } = build({ chatOrders: failing.orders });
    const id = await openSession(app);
    await addToCart(app, id, A.name, 2);
    await showSummary(app, store, id);
    const out = captureOutput();

    let res: Response;
    try {
      res = await sendMessage(app, id, '1');
    } finally {
      out.restore();
    }

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_ERROR_BODY);
    expect(store.get(id)?.state).toBe('SUMMARY');
    expect(cartOf(store, id)).toEqual([{ productId: a, quantity: 2 }]);
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
  });
});

describe('TK-05.6 · ESC-48 · error después de crear el pedido (F-7 "Cierre de la confirmación", D-08, DP-07)', () => {
  test('ESC-48 · con un fallo inyectado al construir el mensaje (D-C): 500 INTERNAL_ERROR genérico; existe exactamente un pedido PENDING y el stock bajó en 2; MAIN_MENU con carrito vacío; un reintento de `1` muestra el catálogo sin otro pedido ni otro descuento', async () => {
    await seedCustomer();
    const a = await insertProduct(db, { ...A, currentStock: 10 });
    const secret = 'detalle-interno-secreto-QA fallo posterior a la creación';
    const { app, store } = build({
      chatConfirmedOrderMessage: () => {
        throw new Error(secret);
      },
    });
    const id = await openSession(app);
    await addToCart(app, id, A.name, 2);
    await showSummary(app, store, id);
    const out = captureOutput();

    let res: Response;
    try {
      res = await sendMessage(app, id, '1');
    } finally {
      out.restore();
    }

    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL_ERROR_BODY);
    expect(JSON.stringify(res.body)).not.toContain('secreto');
    expect(out.all()).not.toContain('secreto');
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ status: 'PENDING', total_amount: '200.00' });
    expect(orders[0].items).toEqual([{ product_id: a, quantity: 2, unit_price: '100.00' }]);
    expect(await stockOf(db, [a])).toEqual({ [a]: 8 });
    expect(store.get(id)?.state).toBe('MAIN_MENU'); // no vuelve a SUMMARY
    expect(cartOf(store, id)).toEqual([]);

    const retry = await say(app, id, '1'); // reintento del cliente
    expect(store.get(id)?.state).toBe('CATALOG');
    expect(retry).toContain(A.name);
    expect(await orderCounts(db)).toMatchObject({ orders: 1 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 8 });
  });
});
