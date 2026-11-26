import request, { type Response } from 'supertest';
import type { Express } from 'express';
import { createApp, type CreateAppOptions } from '../../src/app';
import { ChatSessionStore } from '../../src/modules/chat/session-store';
import { priceRegex } from '../helpers/chat-products';
import { QA_JWT_SECRET, validTestToken } from '../helpers/jwt';
import { connectTestPrisma, type Db, insertOrderWithItem, insertProduct, productRowOrThrow, PRODUCTS } from './helpers/products';

// TK-05.2 · Pruebas de aceptación de QA (fase 1): catálogo y carrito del chat a través de los endpoints, contra PostgreSQL real
// (medsupply_test, RNF-01). Spec 03 §4.2, F-4, F-5, §10.3, §10.4, §10.7 (ESC-43); spec 02 F-7, §8.2 y filas ESC-06, ESC-17, ESC-32
// (parte del chat); ESC-26, ESC-43 y ESC-22 de la spec 03. Contrato docs/openapi.yaml: startChatSession y sendChatMessage (sin cambios).
// Datos propios: la limpieza global de test:db vacía la base antes de cada test; no se usan fixtures externos ni se modifica nada fuera
// de lo que crea cada test. El operador (desactivar, editar, ajustar stock) actúa por los endpoints reales de productos con un JWT de prueba.
// Los números de producto se leen de la lista mostrada; los textos exactos los fija la implementación.
// Matriz: docs/qa/TK-05.2-matrix.md

type Store = NonNullable<CreateAppOptions['chatSessionStore']>;

const ACTIVE_PHONE = '+56912345678';
const NOT_AVAILABLE = /no (est[aá] )?disponible/i;

let db: Db;

beforeAll(async () => {
  db = await connectTestPrisma();
});
afterAll(async () => {
  await db?.$disconnect();
});

function build(): { app: Express; store: Store } {
  const store: Store = new ChatSessionStore({ ttlMinutes: 30 });
  const app = createApp({ auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' }, prisma: db, chatSessionStore: store });
  return { app, store };
}

const startSession = (app: Express) =>
  request(app).post('/api/v1/chat/sessions').set('Content-Type', 'application/json').send(JSON.stringify({ phone: ACTIVE_PHONE }));
const sendMessage = (app: Express, id: string, text: string) =>
  request(app)
    .post(`/api/v1/chat/sessions/${id}/messages`)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ text }));

const operator = () => `Bearer ${validTestToken('1')}`;
const deactivate = (app: Express, productId: number) =>
  request(app).post(`${PRODUCTS}/${productId}/deactivate`).set('Authorization', operator());
const patchProduct = (app: Express, productId: number, body: unknown) =>
  request(app).patch(`${PRODUCTS}/${productId}`).set('Authorization', operator()).set('Content-Type', 'application/json').send(JSON.stringify(body));
const adjustStock = (app: Express, productId: number, body: { newStock: number; expectedStock: number }) =>
  request(app).patch(`${PRODUCTS}/${productId}/stock`).set('Authorization', operator()).set('Content-Type', 'application/json').send(JSON.stringify(body));

async function seedCustomer(): Promise<void> {
  await db.customer.create({ data: { businessName: 'Clínica Los Andes', taxId: '76.111.111-1', phone: ACTIVE_PHONE, isActive: true } });
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
  for (const m of res.body.messages) {
    expect(Object.keys(m)).toEqual(['text']);
    expect(m.text.length).toBeGreaterThan(0);
  }
  return (res.body.messages as { text: string }[]).map((m) => m.text).join('\n');
}

const lines = (text: string): string[] => text.split('\n').map((l) => l.trim());
const lineOf = (text: string, name: string): string | undefined => lines(text).find((l) => l.includes(name));
function numberOf(text: string, name: string): number {
  const line = lines(text).find((l) => l.includes(name) && /^\d+\)/.test(l));
  if (!line) throw new Error(`no hay una línea numerada para "${name}" en:\n${text}`);
  return Number(/^(\d+)\)/.exec(line)![1]);
}
const cartOf = (store: Store, id: string): { productId: number; quantity: number }[] =>
  (store.get(id)!.cart as unknown as { productId: number; quantity: number }[]).map((l) => ({ productId: l.productId, quantity: l.quantity }));

/** Desde MAIN_MENU o CART: abre el catálogo, elige por el número mostrado e indica la cantidad. */
async function addToCart(app: Express, id: string, name: string, quantity: number): Promise<string> {
  const list = await say(app, id, '1');
  await say(app, id, String(numberOf(list, name)));
  return say(app, id, String(quantity));
}

const A = { name: 'Alcohol gel QA', price: '2500.00' };
const B = { name: 'Bata desechable QA', price: '4000.00' };
const C = { name: 'Casco de seguridad QA', price: '12000.00' };

describe('TK-05.2 · ESC-17 / ESC-06 / ESC-32 · el catálogo del chat sale de PostgreSQL (CH-04, RN-10)', () => {
  test('ESC-17 · `1` lista A (activo, stock 10) con precio, B (activo, stock 0) con precio y "Sin stock"; C (inactivo, stock 5) no aparece; `3) Ver carrito`', async () => {
    await seedCustomer();
    await insertProduct(db, { ...A, currentStock: 10 });
    await insertProduct(db, { ...B, currentStock: 0 });
    await insertProduct(db, { ...C, currentStock: 5, isActive: false });
    const { app, store } = build();
    const id = await openSession(app);

    const text = await say(app, id, '1');

    expect(store.get(id)?.state).toBe('CATALOG');
    const a = lineOf(text, A.name);
    const b = lineOf(text, B.name);
    expect(a).toMatch(/^1\)/);
    expect(a).toMatch(priceRegex(A.price));
    expect(a).not.toMatch(/Sin stock/i);
    expect(b).toMatch(/^2\)/);
    expect(b).toMatch(priceRegex(B.price));
    expect(b).toMatch(/Sin stock/);
    expect(text).not.toContain(C.name);
    expect(lines(text).some((l) => /^3\)\s*Ver carrito/i.test(l))).toBe(true);
  });

  test('ESC-17 (spec 02) · un producto con stock 10 ajustado a 0 por el operador aparece "Sin stock" y no se puede elegir', async () => {
    await seedCustomer();
    const productId = await insertProduct(db, { ...A, currentStock: 10 });
    await insertProduct(db, { ...B, currentStock: 4 });
    const { app, store } = build();
    const id = await openSession(app);

    expect((await adjustStock(app, productId, { newStock: 0, expectedStock: 10 })).status).toBe(200);
    const list = await say(app, id, '1');
    expect(lineOf(list, A.name)).toMatch(/Sin stock/);

    const reply = await say(app, id, String(numberOf(list, A.name)));
    expect(store.get(id)?.state).toBe('CATALOG'); // no pasa a ASK_QUANTITY
    expect(reply).not.toBe(list);
    expect(cartOf(store, id)).toEqual([]);
  });

  test('ESC-06 (chat) · un producto activo (stock 2, mínimo 5) con un pedido: aparece en el catálogo; al desactivarlo deja de aparecer y el pedido conserva sus ítems', async () => {
    await seedCustomer();
    const productId = await insertProduct(db, { ...A, currentStock: 2, minStockAlert: 5 });
    await insertProduct(db, { ...B, currentStock: 8 });
    const { orderId } = await insertOrderWithItem(db, productId, { quantity: 1, unitPrice: A.price, totalAmount: A.price });
    const { app } = build();
    const id = await openSession(app);

    expect(await say(app, id, '1')).toContain(A.name);
    expect((await deactivate(app, productId)).status).toBe(200);
    await say(app, id, '0');
    const after = await say(app, id, '1');

    expect(after).not.toContain(A.name);
    expect(after).toContain(B.name);
    expect(await db.orderItem.count({ where: { orderId } })).toBe(1);
  });

  test('ESC-32 (chat) · un producto inactivo editado (nombre, precio, mínimo) con stock ≤ mínimo sigue fuera del catálogo', async () => {
    await seedCustomer();
    const inactiveId = await insertProduct(db, { ...C, currentStock: 1, minStockAlert: 2, isActive: false });
    await insertProduct(db, { ...A, currentStock: 10 });
    const { app } = build();
    const id = await openSession(app);

    const edit = await patchProduct(app, inactiveId, { name: 'Casco renombrado QA', price: '9999.00', minStockAlert: 50 });
    expect(edit.status).toBe(200);
    expect(edit.body.isActive).toBe(false);

    const text = await say(app, id, '1');
    expect(text).toContain(A.name);
    expect(text).not.toContain(C.name);
    expect(text).not.toContain('Casco renombrado QA');
  });
});

describe('TK-05.2 · ESC-26 · el carrito no reserva stock (RN-02)', () => {
  test('ESC-26 · agregar A × 4 deja el stock de A en 10; dos sesiones con A × 4 y A × 8 tampoco lo reservan; no se crea ningún pedido', async () => {
    await seedCustomer();
    const productId = await insertProduct(db, { ...A, currentStock: 10 });
    const { app, store } = build();
    const s1 = await openSession(app);
    const s2 = await openSession(app);

    await addToCart(app, s1, A.name, 4);
    await addToCart(app, s2, A.name, 8);

    expect(cartOf(store, s1)).toEqual([{ productId, quantity: 4 }]);
    expect(cartOf(store, s2)).toEqual([{ productId, quantity: 8 }]);
    expect((await productRowOrThrow(db, productId)).current_stock).toBe(10);
    expect(await db.order.count()).toBe(0);
  });
});

describe('TK-05.2 · ESC-43 / DP-01 · producto desactivado entre la lista y la elección o la cantidad', () => {
  test('ESC-43 · (a) tras mostrar el catálogo el operador desactiva A y el cliente lo elige; (b) en otra conversación se desactiva B después de elegirlo y antes de la cantidad `3`: en ambos casos informa que no está disponible, no lo agrega y vuelve a CATALOG', async () => {
    await seedCustomer();
    const aId = await insertProduct(db, { ...A, currentStock: 10 });
    const bId = await insertProduct(db, { ...B, currentStock: 5 });
    const { app, store } = build();
    const s1 = await openSession(app);
    const s2 = await openSession(app);

    const list1 = await say(app, s1, '1');
    const list2 = await say(app, s2, '1');
    await say(app, s2, String(numberOf(list2, B.name)));
    expect(store.get(s2)?.state).toBe('ASK_QUANTITY');

    expect((await deactivate(app, aId)).status).toBe(200);
    expect((await deactivate(app, bId)).status).toBe(200);

    const reply1 = await say(app, s1, String(numberOf(list1, A.name)));
    expect(reply1).toMatch(NOT_AVAILABLE);
    expect(store.get(s1)?.state).toBe('CATALOG');
    expect(cartOf(store, s1)).toEqual([]);

    const reply2 = await say(app, s2, '3');
    expect(reply2).toMatch(NOT_AVAILABLE);
    expect(store.get(s2)?.state).toBe('CATALOG');
    expect(cartOf(store, s2)).toEqual([]);

    expect((await productRowOrThrow(db, aId)).current_stock).toBe(10);
    expect((await productRowOrThrow(db, bId)).current_stock).toBe(5);
  });
});

describe('TK-05.2 · ESC-22 / CA-04 / D-06 · el stock se revalida contra PostgreSQL (CH-05, US-05 crit. 4)', () => {
  test('ESC-22 · stock real 5 y cantidad `8` → ofrece ajustar a 5 o descartar; `1` deja A × 5; el stock en la base no cambia', async () => {
    await seedCustomer();
    const productId = await insertProduct(db, { ...A, currentStock: 5 });
    const { app, store } = build();
    const id = await openSession(app);

    const reply = await addToCart(app, id, A.name, 8);
    expect(store.get(id)?.state).toBe('STOCK_EXCEEDED');
    expect(reply).toMatch(/\b5\b/);
    expect(cartOf(store, id)).toEqual([]);

    await say(app, id, '1');
    expect(store.get(id)?.state).toBe('CART');
    expect(cartOf(store, id)).toEqual([{ productId, quantity: 5 }]);
    expect((await productRowOrThrow(db, productId)).current_stock).toBe(5);
  });

  test('CH-05 · el operador baja el stock de 10 a 2 entre la elección y la cantidad: pedir `3` ofrece ajustar a 2 y `1` deja A × 2', async () => {
    await seedCustomer();
    const productId = await insertProduct(db, { ...A, currentStock: 10 });
    const { app, store } = build();
    const id = await openSession(app);
    const list = await say(app, id, '1');
    await say(app, id, String(numberOf(list, A.name)));
    expect((await adjustStock(app, productId, { newStock: 2, expectedStock: 10 })).status).toBe(200);

    const reply = await say(app, id, '3');
    expect(store.get(id)?.state).toBe('STOCK_EXCEEDED');
    expect(reply).toMatch(/\b2\b/);
    await say(app, id, '1');
    expect(cartOf(store, id)).toEqual([{ productId, quantity: 2 }]);
  });

  test('D-06 · el stock llega a 0 entre la elección y la cantidad: informa que está agotado, vuelve a CATALOG y no agrega', async () => {
    await seedCustomer();
    const productId = await insertProduct(db, { ...A, currentStock: 10 });
    await insertProduct(db, { ...B, currentStock: 3 });
    const { app, store } = build();
    const id = await openSession(app);
    const list = await say(app, id, '1');
    await say(app, id, String(numberOf(list, A.name)));
    expect((await adjustStock(app, productId, { newStock: 0, expectedStock: 10 })).status).toBe(200);

    const reply = await say(app, id, '2');
    expect(reply).toMatch(/agotad|sin stock/i);
    expect(store.get(id)?.state).toBe('CATALOG');
    expect(cartOf(store, id)).toEqual([]);
  });
});

describe('TK-05.2 · D-4 / D-04 / DP-09 · aislamiento entre sesiones a través de HTTP', () => {
  test('D-4 · dos sesiones del mismo cliente conservan listas y carritos propios: un producto nuevo cambia la numeración solo de la lista mostrada después (ESC-46)', async () => {
    await seedCustomer();
    const aId = await insertProduct(db, { ...A, currentStock: 10 });
    const bId = await insertProduct(db, { ...B, currentStock: 10 });
    const { app, store } = build();
    const s1 = await openSession(app);
    const s2 = await openSession(app);

    const list1 = await say(app, s1, '1'); // [Alcohol, Bata]
    expect(numberOf(list1, A.name)).toBe(1);
    const zId = await insertProduct(db, { name: 'Aposito estéril QA', price: '700.00', currentStock: 9 }); // queda entre Alcohol y Bata
    const list2 = await say(app, s2, '1'); // [Alcohol, Aposito, Bata]: Bata pasa de la posición 2 a la 3
    expect(numberOf(list2, B.name)).toBe(numberOf(list1, B.name) + 1);

    // S1 elige según SU lista (Bata, posición 2, que en la lista vigente ya es Aposito); S2 elige según la suya.
    await say(app, s1, String(numberOf(list1, B.name)));
    await say(app, s2, String(numberOf(list2, 'Aposito estéril QA')));
    await say(app, s2, '3');
    await say(app, s1, '2');

    expect(cartOf(store, s1)).toEqual([{ productId: bId, quantity: 2 }]);
    expect(cartOf(store, s2)).toEqual([{ productId: zId, quantity: 3 }]);
    expect(aId).not.toBe(bId);
  });
});
