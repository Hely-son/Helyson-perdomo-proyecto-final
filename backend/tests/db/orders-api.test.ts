import request from 'supertest';
import type { Express } from 'express';
import { expectErrorResponse } from '../helpers/error-response';
import { nowSeconds, QA_OTHER_SECRET, signTestJwt, validTestToken } from '../helpers/jwt';
import {
  exactTotal,
  insertCustomer,
  type OrderFixtureItem,
  type OrderStatus,
  orderCounts,
  stockOf,
} from './helpers/orders';
import { buildProductsApp, connectTestPrisma, type Db, insertProduct, orderSnapshot } from './helpers/products';

// Pruebas de aceptación de TK-06.2 · endpoints de pedidos del operador contra PostgreSQL real (medsupply_test, RNF-01).
// Spec 04 §4.2, §5.2 (D-06, D-07), F-3, F-4, §7, §8, §11.2 (ESC-16, 19, 30) y §11.3 (ESC-32, 33, 34), DP-01; contrato
// docs/openapi.yaml, tag Orders (RNF-02): listOrders, getOrder, changeOrderStatus; schemas OrderPage, OrderSummary,
// OrderDetail, OrderItem, CustomerDetail, Pagination, ChangeOrderStatusRequest.
// Seguimientos de TK-01.1 asignados aquí (puerta 1, D4): ESC-29 (GET /orders con token válido → 200) y O-3 (variantes de
// ruta sin token sobre rutas reales de /orders).
// Decisión de puerta 1 D1: el PATCH responde OrderDetail construido con una lectura posterior (getOrder); la respuesta
// del PATCH se compara con el GET del mismo pedido en reposo. No se verifica el estado ante transiciones concurrentes.
// No duplica TK-06.1 (combinatoria de transiciones, concurrencia, restitución): solo lo propio de la capa HTTP.
// Los pedidos de partida son fixtures Prisma con createdAt y orderNumber explícitos cuando el escenario lo exige.
// Matriz: docs/qa/TK-06.2-matrix.md. La limpieza global vacía la base antes de cada test. Datos y secretos ficticios.

let db: Db;
let app: Express;
let customerId: number;

beforeAll(async () => {
  db = await connectTestPrisma();
  app = buildProductsApp(db);
});
afterAll(async () => {
  await db?.$disconnect();
});
beforeEach(async () => {
  customerId = await insertCustomer(db);
});

const ORDERS = '/api/v1/orders';
const auth = () => `Bearer ${validTestToken('1')}`;
const listOrders = (query = '') => request(app).get(`${ORDERS}${query}`).set('Authorization', auth());
const getOrder = (id: number | string) => request(app).get(`${ORDERS}/${id}`).set('Authorization', auth());
const changeOrderStatus = (id: number | string, body: unknown) =>
  request(app).patch(`${ORDERS}/${id}/status`).set('Authorization', auth()).set('Content-Type', 'application/json').send(JSON.stringify(body));
const changeOrderStatusRaw = (id: number | string, raw: string) =>
  request(app).patch(`${ORDERS}/${id}/status`).set('Authorization', auth()).set('Content-Type', 'application/json').send(raw);

// ---------------------------------------------------------------------------------------------
// Fixtures y comprobaciones de forma (schemas del contrato, additionalProperties: false)
// ---------------------------------------------------------------------------------------------

const MONEY = /^(?!0+\.00$)\d{1,10}\.\d{2}$/;
const ORDER_NUMBER = /^MED-\d{5,}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];

interface OrderAtInput {
  customerId?: number;
  status?: OrderStatus;
  createdAt?: Date;
  orderNumber?: string;
  items: OrderFixtureItem[];
}

/** Pedido fixture con `createdAt` y `orderNumber` opcionales (los demás valores, por defecto de la base). */
async function insertOrderAt(input: OrderAtInput): Promise<{ id: number; orderNumber: string }> {
  const items = input.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice ?? '100.00' }));
  const order = await db.order.create({
    data: {
      customerId: input.customerId ?? customerId,
      status: input.status ?? 'PENDING',
      totalAmount: exactTotal(items),
      createdAt: input.createdAt,
      orderNumber: input.orderNumber,
      items: { create: items },
    },
  });
  return { id: order.id, orderNumber: order.orderNumber };
}

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 12, minutes, 0, 0));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectPaginationShape(body: unknown): Record<string, number> {
  expect(isRecord(body)).toBe(true);
  const p = body as Record<string, number>;
  expect(Object.keys(p).sort()).toEqual(['page', 'pageSize', 'totalItems', 'totalPages']);
  for (const key of Object.keys(p)) expect(Number.isInteger(p[key])).toBe(true);
  expect(p.page).toBeGreaterThanOrEqual(1);
  expect(p.pageSize).toBeGreaterThanOrEqual(1);
  expect(p.totalItems).toBeGreaterThanOrEqual(0);
  expect(p.totalPages).toBeGreaterThanOrEqual(0);
  return p;
}

function expectSummaryShape(item: unknown): void {
  expect(isRecord(item)).toBe(true);
  const o = item as Record<string, unknown>;
  expect(Object.keys(o).sort()).toEqual(['createdAt', 'customer', 'id', 'orderNumber', 'status', 'totalAmount']);
  expect(Number.isInteger(o.id)).toBe(true);
  expect(o.orderNumber).toMatch(ORDER_NUMBER);
  expect(STATUSES).toContain(o.status);
  expect(o.totalAmount).toMatch(MONEY);
  expect(o.createdAt).toMatch(ISO_UTC);
  expect(isRecord(o.customer)).toBe(true);
  const c = o.customer as Record<string, unknown>;
  expect(Object.keys(c).sort()).toEqual(['businessName', 'id']);
  expect(Number.isInteger(c.id)).toBe(true);
  expect(typeof c.businessName).toBe('string');
}

interface PageBody {
  items: Record<string, unknown>[];
  pagination: Record<string, number>;
}

/** Exige un cuerpo OrderPage exacto { items, pagination } con cada ítem OrderSummary. */
function expectPageShape(body: unknown): PageBody {
  expect(isRecord(body)).toBe(true);
  expect(Object.keys(body as object).sort()).toEqual(['items', 'pagination']);
  const { items, pagination } = body as { items: unknown; pagination: unknown };
  expect(Array.isArray(items)).toBe(true);
  for (const item of items as unknown[]) expectSummaryShape(item);
  return { items: items as Record<string, unknown>[], pagination: expectPaginationShape(pagination) };
}

/** Exige un cuerpo OrderDetail (additionalProperties: false en todos los niveles; sin reclamos). */
function expectDetailShape(body: unknown): Record<string, unknown> {
  expect(isRecord(body)).toBe(true);
  const o = body as Record<string, unknown>;
  expect(Object.keys(o).sort()).toEqual(['createdAt', 'customer', 'id', 'items', 'orderNumber', 'status', 'totalAmount', 'updatedAt']);
  expect(Number.isInteger(o.id)).toBe(true);
  expect(o.orderNumber).toMatch(ORDER_NUMBER);
  expect(STATUSES).toContain(o.status);
  expect(o.totalAmount).toMatch(MONEY);
  expect(o.createdAt).toMatch(ISO_UTC);
  expect(o.updatedAt).toMatch(ISO_UTC);
  expect(isRecord(o.customer)).toBe(true);
  expect(Object.keys(o.customer as object).sort()).toEqual(['businessName', 'id', 'phone', 'taxId']);
  const c = o.customer as Record<string, unknown>;
  expect(Number.isInteger(c.id)).toBe(true);
  for (const key of ['businessName', 'taxId', 'phone']) expect(typeof c[key]).toBe('string');
  expect(Array.isArray(o.items)).toBe(true);
  expect((o.items as unknown[]).length).toBeGreaterThanOrEqual(1);
  for (const item of o.items as unknown[]) {
    expect(isRecord(item)).toBe(true);
    const i = item as Record<string, unknown>;
    expect(Object.keys(i).sort()).toEqual(['productId', 'productName', 'quantity', 'subtotal', 'unitPrice']);
    expect(Number.isInteger(i.productId)).toBe(true);
    expect(typeof i.productName).toBe('string');
    expect(Number.isInteger(i.quantity)).toBe(true);
    expect(i.quantity as number).toBeGreaterThanOrEqual(1);
    expect(i.unitPrice).toMatch(MONEY);
    expect(i.subtotal).toMatch(MONEY);
  }
  return o;
}

const idsOf = (body: PageBody): number[] => body.items.map((i) => i.id as number);

/** Todo lo observable de un pedido y del stock de sus productos (incluidos updated_at), para comprobar "sin cambios". */
async function observe(orderId: number, productIds: number[]) {
  return { snapshot: await orderSnapshot(db, orderId), stock: await stockOf(db, productIds), counts: await orderCounts(db) };
}

/** Pedido con A × 2 (100.00) y B × 1 (50.00) en el estado dado; stock A 8 y B 4 (valores de ESC-22). */
async function setupOrder(status: OrderStatus) {
  const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 8 });
  const b = await insertProduct(db, { name: 'B', price: '50.00', currentStock: 4 });
  const order = await insertOrderAt({
    status,
    items: [
      { productId: a, quantity: 2, unitPrice: '100.00' },
      { productId: b, quantity: 1, unitPrice: '50.00' },
    ],
  });
  return { a, b, ...order };
}

/** Siete pedidos de ESC-32: tres con el mismo createdAt (T3), insertados fuera del orden de fecha. */
async function setupListingFixture() {
  const p = await insertProduct(db, { name: 'P', price: '10.00' });
  const mk = (status: OrderStatus, minutes: number) => insertOrderAt({ status, createdAt: at(minutes), items: [{ productId: p, quantity: 1, unitPrice: '10.00' }] });
  const a = await mk('PENDING', 2);
  const b = await mk('DELIVERED', 5);
  const c = await mk('PENDING', 3);
  const d = await mk('PENDING', 3);
  const e = await mk('PROCESSING', 1);
  const f = await mk('CANCELLED', 4);
  const g = await mk('PROCESSING', 3);
  // Orden esperado (createdAt desc, id desc): b(T5) f(T4) g d c (T3, id desc) a(T2) e(T1).
  return { a: a.id, b: b.id, c: c.id, d: d.id, e: e.id, f: f.id, g: g.id, full: [b.id, f.id, g.id, d.id, c.id, a.id, e.id] };
}

// ---------------------------------------------------------------------------------------------
// ESC-32 · listOrders: filtro, paginación, orden determinista (PE-01, DP-01, US-06 crit. 6)
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · ESC-32 listOrders: filtro, paginación y orden createdAt desc + id desc', () => {
  test('ESC-32 sin filtro: todos los pedidos por createdAt descendente y, a igualdad de fecha, por id descendente; OrderPage con totales reales', async () => {
    const f = await setupListingFixture();
    const res = await listOrders();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    const page = expectPageShape(res.body);
    expect(idsOf(page)).toEqual(f.full);
    expect(page.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 7, totalPages: 1 });
    // Los tres con el mismo createdAt: el de mayor id primero.
    expect(page.items.filter((i) => i.createdAt === at(3).toISOString()).map((i) => i.id)).toEqual([f.g, f.d, f.c]);
  });

  test('ESC-32 cada ítem OrderSummary coincide con la base: número, estado, total, createdAt y cliente (id y razón social)', async () => {
    const f = await setupListingFixture();
    const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
    const page = expectPageShape((await listOrders()).body);
    const rows = await db.order.findMany({ where: { id: { in: f.full } } });
    for (const item of page.items) {
      const row = rows.find((r) => r.id === item.id);
      expect(row).toBeDefined();
      expect(item).toEqual({
        id: row!.id,
        orderNumber: row!.orderNumber,
        status: row!.status,
        totalAmount: row!.totalAmount.toFixed(2),
        customer: { id: customer.id, businessName: customer.businessName },
        createdAt: row!.createdAt.toISOString(),
      });
    }
  });

  test('ESC-32 con filtro status: solo pedidos de ese estado, en el mismo orden determinista, con totalItems y totalPages del filtro', async () => {
    const f = await setupListingFixture();
    const expected: Record<OrderStatus, number[]> = {
      PENDING: [f.d, f.c, f.a],
      PROCESSING: [f.g, f.e],
      DISPATCHED: [],
      DELIVERED: [f.b],
      CANCELLED: [f.f],
    };
    for (const status of STATUSES) {
      const res = await listOrders(`?status=${status}`);
      expect(res.status).toBe(200);
      const page = expectPageShape(res.body);
      expect(idsOf(page)).toEqual(expected[status]);
      for (const item of page.items) expect(item.status).toBe(status);
      expect(page.pagination).toEqual({ page: 1, pageSize: 20, totalItems: expected[status].length, totalPages: expected[status].length === 0 ? 0 : 1 });
    }
  });

  test('ESC-32 paginación (pageSize 2): las páginas, concatenadas, reproducen el orden completo; el grupo de igual createdAt se parte entre páginas sin repetir ni omitir', async () => {
    const f = await setupListingFixture();
    const pages: number[][] = [];
    for (const n of [1, 2, 3, 4]) {
      const res = await listOrders(`?page=${n}&pageSize=2`);
      expect(res.status).toBe(200);
      const page = expectPageShape(res.body);
      expect(page.pagination).toEqual({ page: n, pageSize: 2, totalItems: 7, totalPages: 4 });
      pages.push(idsOf(page));
    }
    expect(pages).toEqual([[f.b, f.f], [f.g, f.d], [f.c, f.a], [f.e]]);
    expect(pages.flat()).toEqual(f.full);
  });

  test('ESC-32 paginación con filtro (PENDING, pageSize 2): totales del filtro y páginas consistentes', async () => {
    const f = await setupListingFixture();
    const p1 = expectPageShape((await listOrders('?status=PENDING&page=1&pageSize=2')).body);
    const p2 = expectPageShape((await listOrders('?status=PENDING&page=2&pageSize=2')).body);
    expect(idsOf(p1)).toEqual([f.d, f.c]);
    expect(idsOf(p2)).toEqual([f.a]);
    expect(p1.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
    expect(p2.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
  });

  test('ESC-32 página fuera de rango: 200 con items [] y los totales reales (sin y con filtro)', async () => {
    await setupListingFixture();
    const res = await listOrders('?page=99&pageSize=2');
    expect(res.status).toBe(200);
    const page = expectPageShape(res.body);
    expect(page.items).toEqual([]);
    expect(page.pagination).toEqual({ page: 99, pageSize: 2, totalItems: 7, totalPages: 4 });

    const filtered = await listOrders('?status=PENDING&page=5&pageSize=2');
    expect(filtered.status).toBe(200);
    const fp = expectPageShape(filtered.body);
    expect(fp.items).toEqual([]);
    expect(fp.pagination).toEqual({ page: 5, pageSize: 2, totalItems: 3, totalPages: 2 });
  });

  test('ESC-32 repetición: la misma consulta sobre el mismo conjunto (sin inserciones ni cambios) devuelve el mismo orden y el mismo cuerpo', async () => {
    const f = await setupListingFixture();
    const first = await listOrders();
    const second = await listOrders();
    const third = await listOrders();
    expect(idsOf(expectPageShape(first.body))).toEqual(f.full);
    expect(second.body).toEqual(first.body);
    expect(third.body).toEqual(first.body);
    const f1 = await listOrders('?status=PENDING&pageSize=2');
    const f2 = await listOrders('?status=PENDING&pageSize=2');
    expect(f2.body).toEqual(f1.body);
  });

  test('ESC-32 valores por defecto del contrato: sin page ni pageSize → page 1 y pageSize 20 (21 pedidos: 20 en la primera página, totalPages 2)', async () => {
    const p = await insertProduct(db, { name: 'P', price: '10.00' });
    const ids: number[] = [];
    for (let m = 0; m < 21; m += 1) {
      ids.push((await insertOrderAt({ createdAt: at(m), items: [{ productId: p, quantity: 1, unitPrice: '10.00' }] })).id);
    }
    const res = await listOrders();
    expect(res.status).toBe(200);
    const page = expectPageShape(res.body);
    expect(page.items).toHaveLength(20);
    expect(idsOf(page)).toEqual([...ids].reverse().slice(0, 20));
    expect(page.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 21, totalPages: 2 });
    const last = expectPageShape((await listOrders('?page=2')).body);
    expect(idsOf(last)).toEqual([ids[0]]);
    expect(last.pagination).toEqual({ page: 2, pageSize: 20, totalItems: 21, totalPages: 2 });
  });

  test('contrato: sin pedidos → 200 con items [] y pagination { page 1, pageSize 20, totalItems 0, totalPages 0 }', async () => {
    const res = await listOrders();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  test.each([
    ['pageSize 1', '?pageSize=1', 1],
    ['pageSize 100 (máximo)', '?pageSize=100', 100],
  ])('contrato: %s es válido → 200 y pagination.pageSize = tamaño pedido', async (_label, query, size) => {
    const p = await insertProduct(db, { name: 'P', price: '10.00' });
    await insertOrderAt({ items: [{ productId: p, quantity: 1, unitPrice: '10.00' }] });
    const res = await listOrders(query);
    expect(res.status).toBe(200);
    const page = expectPageShape(res.body);
    expect(page.pagination).toEqual({ page: 1, pageSize: size, totalItems: 1, totalPages: 1 });
  });

  test.each([
    ['status fuera del enum (SHIPPED)', '?status=SHIPPED'],
    ['status en minúsculas (pending)', '?status=pending'],
    ['page 0', '?page=0'],
    ['page negativo', '?page=-1'],
    ['page no entero (1.5)', '?page=1.5'],
    ['page no numérico (abc)', '?page=abc'],
    ['pageSize 0', '?pageSize=0'],
    ['pageSize 101 (> máximo)', '?pageSize=101'],
    ['pageSize negativo', '?pageSize=-5'],
    ['pageSize no entero (2.5)', '?pageSize=2.5'],
    ['pageSize no numérico (abc)', '?pageSize=abc'],
    ['filtro válido con page inválido', '?status=PENDING&page=0'],
  ])('contrato: listOrders con %s → 422 VALIDATION_ERROR', async (_label, query) => {
    const f = await setupListingFixture();
    const res = await listOrders(query);
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expect(await db.order.count()).toBe(f.full.length);
  });

  test('robustez: page 2147483648 (válida por contrato, sin máximo) no provoca un error interno (200 con items [] o 422, nunca 500)', async () => {
    await setupListingFixture();
    const res = await listOrders('?page=2147483648&pageSize=2');
    expect([200, 422]).toContain(res.status);
    if (res.status === 200) expect(expectPageShape(res.body).items).toEqual([]);
    else expectErrorResponse(res, 422, 'VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-33 · el orden es por fecha, no por número (RN-04, spec 01)
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · ESC-33 listOrders no ordena por order_number', () => {
  test('ESC-33 MED-99999 (más antiguo) y MED-100000 (más reciente) → MED-100000 primero', async () => {
    const p = await insertProduct(db, { name: 'P', price: '10.00' });
    const old = await insertOrderAt({ orderNumber: 'MED-99999', createdAt: at(1), items: [{ productId: p, quantity: 1, unitPrice: '10.00' }] });
    const recent = await insertOrderAt({ orderNumber: 'MED-100000', createdAt: at(2), items: [{ productId: p, quantity: 1, unitPrice: '10.00' }] });
    const res = await listOrders();
    expect(res.status).toBe(200);
    const page = expectPageShape(res.body);
    expect(page.items.map((i) => i.orderNumber)).toEqual(['MED-100000', 'MED-99999']);
    expect(idsOf(page)).toEqual([recent.id, old.id]);
  });

  test('ESC-33 variante: el pedido más antiguo con el número mayor (MED-00002) y el más reciente con el menor (MED-00001) → el más reciente primero', async () => {
    const p = await insertProduct(db, { name: 'P', price: '10.00' });
    const old = await insertOrderAt({ orderNumber: 'MED-00002', createdAt: at(1), items: [{ productId: p, quantity: 1, unitPrice: '10.00' }] });
    const recent = await insertOrderAt({ orderNumber: 'MED-00001', createdAt: at(2), items: [{ productId: p, quantity: 1, unitPrice: '10.00' }] });
    const page = expectPageShape((await listOrders()).body);
    expect(page.items.map((i) => i.orderNumber)).toEqual(['MED-00001', 'MED-00002']);
    expect(idsOf(page)).toEqual([recent.id, old.id]);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-34 · getOrder: detalle con precio histórico, nombre actual y cliente (PE-01, RN-03, US-03 crit. 5)
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · ESC-34 getOrder devuelve el detalle del pedido', () => {
  test('ESC-34 pedido con A a 100.00 (3 uds) y B a 50.50 (2 uds); A pasa a 120.00 y se renombra → unitPrice histórico, nombre actual, subtotales y total coherentes, cliente completo, sin reclamos', async () => {
    const customer = await db.customer.create({ data: { businessName: 'Clínica Santa Rosa QA', taxId: '76.123.456-7', phone: '+56912345678' } });
    const a = await insertProduct(db, { name: 'Guantes originales', price: '100.00', currentStock: 20 });
    const b = await insertProduct(db, { name: 'Jeringas', price: '50.50', currentStock: 20 });
    const order = await insertOrderAt({
      customerId: customer.id,
      status: 'PROCESSING',
      createdAt: at(7),
      items: [
        { productId: a, quantity: 3, unitPrice: '100.00' },
        { productId: b, quantity: 2, unitPrice: '50.50' },
      ],
    });
    await db.product.update({ where: { id: a }, data: { price: '120.00', name: 'Guantes de nitrilo (renombrado)' } });

    const res = await getOrder(order.id);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    const body = expectDetailShape(res.body);
    const row = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(body).toMatchObject({
      id: order.id,
      orderNumber: order.orderNumber,
      status: 'PROCESSING',
      totalAmount: '401.00',
      customer: { id: customer.id, businessName: 'Clínica Santa Rosa QA', taxId: '76.123.456-7', phone: '+56912345678' },
      createdAt: at(7).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
    const items = [...(body.items as Record<string, unknown>[])].sort((x, y) => (x.productId as number) - (y.productId as number));
    expect(items).toEqual([
      { productId: a, productName: 'Guantes de nitrilo (renombrado)', quantity: 3, unitPrice: '100.00', subtotal: '300.00' },
      { productId: b, productName: 'Jeringas', quantity: 2, unitPrice: '50.50', subtotal: '101.00' },
    ]);
    // Coherencia: el total es la suma de los subtotales, y no se usó el precio vigente (120.00).
    const sum = items.reduce((acc, i) => acc + Math.round(Number(i.subtotal) * 100), 0);
    expect(sum).toBe(Math.round(Number(body.totalAmount) * 100));
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 20, [b]: 20 });
  });

  test('ESC-34 contrato: un producto desactivado después de confirmar sigue apareciendo en el detalle con su nombre actual y el precio guardado', async () => {
    const a = await insertProduct(db, { name: 'Mascarillas', price: '20.00', currentStock: 5 });
    const order = await insertOrderAt({ items: [{ productId: a, quantity: 4, unitPrice: '20.00' }] });
    await db.product.update({ where: { id: a }, data: { isActive: false } });
    const body = expectDetailShape((await getOrder(order.id)).body);
    expect(body.items).toEqual([{ productId: a, productName: 'Mascarillas', quantity: 4, unitPrice: '20.00', subtotal: '80.00' }]);
    expect(body.totalAmount).toBe('80.00');
  });

  test('getOrder no modifica el pedido ni el stock (lectura pura)', async () => {
    const o = await setupOrder('PENDING');
    const before = await observe(o.id, [o.a, o.b]);
    expectDetailShape((await getOrder(o.id)).body);
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-30 y ids inválidos · getOrder y changeOrderStatus (PE-01, PE-02)
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · ESC-30 pedido inexistente y orderId inválido', () => {
  test('ESC-30 getOrder con un id inexistente → 404 ORDER_NOT_FOUND', async () => {
    await setupOrder('PENDING');
    expectErrorResponse(await getOrder(999999), 404, 'ORDER_NOT_FOUND');
  });

  test.each(STATUSES.filter((s) => s !== 'PENDING'))('ESC-30 changeOrderStatus (%s) con un id inexistente → 404 ORDER_NOT_FOUND y no se crea ni cambia nada', async (status) => {
    const o = await setupOrder('PROCESSING');
    const before = await observe(o.id, [o.a, o.b]);
    expectErrorResponse(await changeOrderStatus(999999, { status }), 404, 'ORDER_NOT_FOUND');
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });

  test.each([
    ['abc'],
    ['0'],
    ['-1'],
    ['1.5'],
    ['01x'],
    ['2147483648'],
    ['99999999999999999999'],
  ])('contrato: getOrder con orderId "%s" → 422 VALIDATION_ERROR', async (id) => {
    await setupOrder('PENDING');
    expectErrorResponse(await getOrder(id), 422, 'VALIDATION_ERROR');
  });

  test.each([
    ['abc'],
    ['0'],
    ['-1'],
    ['1.5'],
    ['01x'],
    ['2147483648'],
    ['99999999999999999999'],
  ])('contrato: changeOrderStatus con orderId "%s" → 422 VALIDATION_ERROR y el pedido existente no cambia', async (id) => {
    const o = await setupOrder('PENDING');
    const before = await observe(o.id, [o.a, o.b]);
    expectErrorResponse(await changeOrderStatus(id, { status: 'PROCESSING' }), 422, 'VALIDATION_ERROR');
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-16 · changeOrderStatus: avance por HTTP con el detalle actualizado (PE-02, RN-05, D-07, US-06 crit. 4)
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · ESC-16 changeOrderStatus avanza y responde el OrderDetail actualizado', () => {
  test('ESC-16 PENDING → PROCESSING → DISPATCHED → DELIVERED: cada paso responde 200 OrderDetail con el estado nuevo, igual al GET del pedido; el stock, los ítems y el total no cambian', async () => {
    const o = await setupOrder('PENDING');
    const stock0 = await stockOf(db, [o.a, o.b]);
    expect(stock0).toEqual({ [o.a]: 8, [o.b]: 4 });
    const initial = expectDetailShape((await getOrder(o.id)).body);

    for (const target of ['PROCESSING', 'DISPATCHED', 'DELIVERED'] as const) {
      const res = await changeOrderStatus(o.id, { status: target });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      const body = expectDetailShape(res.body);
      expect(body.status).toBe(target);
      expect(body.id).toBe(o.id);
      expect(body.orderNumber).toBe(o.orderNumber);
      expect(body.totalAmount).toBe(initial.totalAmount);
      expect(body.customer).toEqual(initial.customer);
      expect(body.items).toEqual(initial.items);
      expect(body.createdAt).toBe(initial.createdAt);
      // Persistido, y la respuesta es exactamente lo que devuelve getOrder (D1).
      expect((await orderSnapshot(db, o.id)).order.status).toBe(target);
      expect((await getOrder(o.id)).body).toEqual(res.body);
      // D-07: avanzar no toca el stock.
      expect(await stockOf(db, [o.a, o.b])).toEqual(stock0);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Cancelación por HTTP (RN-05, CA-12 (a)): un caso; la restitución en profundidad es de TK-06.1
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · changeOrderStatus CANCELLED por HTTP', () => {
  test('CA-12 (a) PROCESSING → CANCELLED: 200 OrderDetail con estado CANCELLED, ítems y total conservados; el stock se restituye (A 8 → 10, B 4 → 5)', async () => {
    const o = await setupOrder('PROCESSING');
    const before = expectDetailShape((await getOrder(o.id)).body);
    const res = await changeOrderStatus(o.id, { status: 'CANCELLED' });
    expect(res.status).toBe(200);
    const body = expectDetailShape(res.body);
    expect(body.status).toBe('CANCELLED');
    expect(body.items).toEqual(before.items);
    expect(body.totalAmount).toBe(before.totalAmount);
    expect(body.customer).toEqual(before.customer);
    expect((await orderSnapshot(db, o.id)).order.status).toBe('CANCELLED');
    expect(await stockOf(db, [o.a, o.b])).toEqual({ [o.a]: 10, [o.b]: 5 });
    expect((await getOrder(o.id)).body).toEqual(res.body);
  });
});

// ---------------------------------------------------------------------------------------------
// 409 INVALID_ORDER_TRANSITION por HTTP (RN-05, D-06, CA-12 (b), spec 04 §8)
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · changeOrderStatus: transición no permitida → 409 INVALID_ORDER_TRANSITION', () => {
  test.each([
    ['PENDING', 'DISPATCHED'],
    ['PENDING', 'DELIVERED'],
    ['PROCESSING', 'PROCESSING'],
    ['PROCESSING', 'DELIVERED'],
    ['DISPATCHED', 'PROCESSING'],
    ['DISPATCHED', 'CANCELLED'],
    ['DELIVERED', 'CANCELLED'],
    ['DELIVERED', 'DELIVERED'],
    ['CANCELLED', 'PROCESSING'],
    ['CANCELLED', 'CANCELLED'],
  ] as const)('%s → %s responde 409 INVALID_ORDER_TRANSITION; ni el pedido (incluido updated_at) ni el stock cambian', async (from, to) => {
    const o = await setupOrder(from);
    const before = await observe(o.id, [o.a, o.b]);
    expectErrorResponse(await changeOrderStatus(o.id, { status: to }), 409, 'INVALID_ORDER_TRANSITION');
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-19 y validación del cuerpo (PE-02, RN-05, contrato ChangeOrderStatusRequest)
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · ESC-19 y validación del cuerpo de changeOrderStatus', () => {
  test('ESC-19 PROCESSING → PENDING: 422 VALIDATION_ERROR (PENDING nunca es destino), no 409; sin cambios', async () => {
    const o = await setupOrder('PROCESSING');
    const before = await observe(o.id, [o.a, o.b]);
    expectErrorResponse(await changeOrderStatus(o.id, { status: 'PENDING' }), 422, 'VALIDATION_ERROR');
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });

  test.each([
    ['PENDING sobre un pedido PENDING (mismo estado)', 'PENDING', { status: 'PENDING' }],
    ['estado fuera del enum (SHIPPED)', 'PROCESSING', { status: 'SHIPPED' }],
    ['estado en minúsculas (processing)', 'PENDING', { status: 'processing' }],
    ['estado con espacios (" PROCESSING")', 'PENDING', { status: ' PROCESSING' }],
    ['estado null', 'PROCESSING', { status: null }],
    ['estado numérico', 'PROCESSING', { status: 1 }],
    ['estado arreglo', 'PROCESSING', { status: ['DISPATCHED'] }],
    ['estado objeto', 'PROCESSING', { status: { value: 'DISPATCHED' } }],
    ['cuerpo {} (sin status)', 'PROCESSING', {}],
    ['propiedad extra (extra)', 'PROCESSING', { status: 'DISPATCHED', extra: true }],
    ['propiedad extra sensible (currentStock)', 'PROCESSING', { status: 'CANCELLED', currentStock: 999 }],
    ['propiedad extra id', 'PROCESSING', { status: 'DISPATCHED', id: 1 }],
    ['campo distinto de status', 'PROCESSING', { newStatus: 'DISPATCHED' }],
    ['cuerpo arreglo', 'PROCESSING', ['DISPATCHED']],
    ['cuerpo null', 'PROCESSING', null],
    ['cuerpo cadena JSON', 'PROCESSING', 'DISPATCHED'],
    ['cuerpo número JSON', 'PROCESSING', 7],
  ] as const)('contrato: %s → 422 VALIDATION_ERROR y el pedido y el stock no cambian', async (_label, from, body) => {
    const o = await setupOrder(from);
    const before = await observe(o.id, [o.a, o.b]);
    expectErrorResponse(await changeOrderStatus(o.id, body), 422, 'VALIDATION_ERROR');
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });

  test('contrato: petición sin cuerpo ni Content-Type → 422 VALIDATION_ERROR (no 500) y sin cambios', async () => {
    const o = await setupOrder('PROCESSING');
    const before = await observe(o.id, [o.a, o.b]);
    const res = await request(app).patch(`${ORDERS}/${o.id}/status`).set('Authorization', auth());
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });

  test.each(['{"status": ', 'no es json', '{status: "DISPATCHED"}', '{"status": "DISPATCHED"'])(
    'contrato: cuerpo que no es JSON válido (%s) → 400 MALFORMED_REQUEST y el pedido no cambia',
    async (raw) => {
      const o = await setupOrder('PROCESSING');
      const before = await observe(o.id, [o.a, o.b]);
      expectErrorResponse(await changeOrderStatusRaw(o.id, raw), 400, 'MALFORMED_REQUEST');
      expect(await observe(o.id, [o.a, o.b])).toEqual(before);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// ESC-29 (seguimiento TK-01.1) · listOrders con token válido
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · ESC-29 (TK-01.1) GET /api/v1/orders con token válido responde 200', () => {
  test('ESC-29 listOrders con token válido sobre base vacía → 200 OrderPage vacía', async () => {
    const res = await request(app).get(ORDERS).set('Authorization', `Bearer ${validTestToken('1')}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });

  test('ESC-29 listOrders con token válido y un pedido → 200 OrderPage con ese pedido', async () => {
    const o = await setupOrder('PENDING');
    const res = await listOrders();
    expect(res.status).toBe(200);
    const page = expectPageShape(res.body);
    expect(idsOf(page)).toEqual([o.id]);
    expect(page.items[0].orderNumber).toBe(o.orderNumber);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-31 y O-3 (seguimiento TK-01.1) · sin sesión válida y variantes de ruta sobre rutas reales
// ---------------------------------------------------------------------------------------------

describe('TK-06.2 · sin sesión válida (ESC-31) y O-3 (TK-01.1) sobre rutas reales de /orders → 401 UNAUTHORIZED sin efectos', () => {
  const expired = () => {
    const iat = nowSeconds() - 7200;
    return signTestJwt({ sub: '1', iat, exp: iat + 3600 });
  };
  const CREDENTIALS: [string, () => string | undefined][] = [
    ['sin Authorization', () => undefined],
    ['token firmado con otro secreto', () => `Bearer ${validTestToken('1', QA_OTHER_SECRET)}`],
    ['token expirado', () => `Bearer ${expired()}`],
  ];
  const OPS: [string, string, (id: number) => string, unknown][] = [
    ['listOrders', 'get', () => ORDERS, undefined],
    ['getOrder', 'get', (id) => `${ORDERS}/${id}`, undefined],
    ['changeOrderStatus', 'patch', (id) => `${ORDERS}/${id}/status`, { status: 'CANCELLED' }],
  ];
  const CASES = OPS.flatMap((op) => CREDENTIALS.map((cred) => [op[0], cred[0], op, cred[1]] as const));

  type Agent = Record<string, (u: string) => request.Test>;

  test.each(CASES)('ESC-31 %s %s → 401 UNAUTHORIZED y la base no cambia', async (_op, _cred, op, header) => {
    const o = await setupOrder('PROCESSING');
    const before = await observe(o.id, [o.a, o.b]);
    const [, method, url, body] = op;
    let req = (request(app) as unknown as Agent)[method](url(o.id));
    const value = header();
    if (value !== undefined) req = req.set('Authorization', value);
    const res = body === undefined ? await req : await req.set('Content-Type', 'application/json').send(JSON.stringify(body));
    expectErrorResponse(res, 401, 'UNAUTHORIZED');
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });

  /** Codifica cada carácter del texto como %XX (variante codificada de un segmento de ruta). */
  const pct = (text: string) => [...text].map((ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`).join('');

  const VARIANTS: [string, string, (id: number) => string, unknown][] = [
    ['get', 'mayúsculas', () => '/API/V1/ORDERS', undefined],
    ['get', 'barra final', () => '/api/v1/orders/', undefined],
    ['get', 'con query', () => '/api/v1/orders?status=PENDING', undefined],
    ['get', 'mayúsculas mixtas con id', (id) => `/Api/V1/Orders/${id}`, undefined],
    ['get', 'mayúsculas con id', (id) => `/API/V1/ORDERS/${id}`, undefined],
    ['get', 'id con barra final', (id) => `/api/v1/orders/${id}/`, undefined],
    ['get', 'id codificado (%31…)', (id) => `/api/v1/orders/${pct(String(id))}`, undefined],
    ['patch', 'mayúsculas en /STATUS', (id) => `/API/V1/ORDERS/${id}/STATUS`, { status: 'CANCELLED' }],
    ['patch', 'barra final en /status/', (id) => `/api/v1/orders/${id}/status/`, { status: 'CANCELLED' }],
    ['patch', 'segmento codificado (/%73tatus)', (id) => `/api/v1/orders/${id}/%73tatus`, { status: 'CANCELLED' }],
    ['patch', 'id y segmento codificados', (id) => `/api/v1/orders/${pct(String(id))}/${pct('status')}`, { status: 'CANCELLED' }],
    ['patch', 'prefijo codificado (/api/v1/%6frders)', (id) => `/api/v1/%6frders/${id}/status`, { status: 'CANCELLED' }],
  ];

  test.each(VARIANTS)('O-3: %s (%s) sin token → no accede al recurso: 401 UNAUTHORIZED y la base no cambia', async (method, _label, url, body) => {
    const o = await setupOrder('PROCESSING');
    const before = await observe(o.id, [o.a, o.b]);
    const req = (request(app) as unknown as Agent)[method](url(o.id));
    const res = body === undefined ? await req : await req.set('Content-Type', 'application/json').send(JSON.stringify(body));
    // El prefijo codificado no coincide con el montaje protegido: se acepta 401 o 404, nunca éxito ni datos.
    if (url(o.id).includes('%6frders')) expect([401, 404]).toContain(res.status);
    else expectErrorResponse(res, 401, 'UNAUTHORIZED');
    expect(await observe(o.id, [o.a, o.b])).toEqual(before);
  });

  test('O-3: con token válido las variantes de ruta no revelan datos de otro modo (control): /api/v1/orders/{id} devuelve el pedido', async () => {
    const o = await setupOrder('PROCESSING');
    const res = await getOrder(o.id);
    expect(res.status).toBe(200);
    expect(expectDetailShape(res.body).id).toBe(o.id);
  });
});
