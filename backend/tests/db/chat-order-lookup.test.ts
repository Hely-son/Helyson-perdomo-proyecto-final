import { readFileSync } from 'node:fs';
import path from 'node:path';
import request, { type Response } from 'supertest';
import type { Express } from 'express';
import { createApp, type CreateAppOptions } from '../../src/app';
import { ChatSessionStore } from '../../src/modules/chat/session-store';
import { createOrderService } from '../../src/modules/orders/orders.service';
import { rawSql, type SpyCall, spyOnPrisma } from '../helpers/prisma-spy';
import { QA_JWT_SECRET } from '../helpers/jwt';
import { persistedOrders } from './helpers/orders';
import { connectTestPrisma, type Db, insertProduct } from './helpers/products';

// TK-06.3 · Pruebas de aceptación de QA (fase 1): "Mis pedidos" contra PostgreSQL real (medsupply_test, RNF-01).
// Spec 03 F-8, §10.6: ESC-39 (I), ESC-40 (I; CA-07). Spec 04 F-2, D-08, §11.3: ESC-35 (I), ESC-36 (I). Entrada con U+0000 (puerta 1).
// Contrato docs/openapi.yaml: sendChatMessage (sin cambios). El nivel de unidad (incluidos spec 03 ESC-41 y ESC-42) está en
// tests/unit/chat/chat-order-lookup.test.ts; el E2E de CA-07 es de TK-06.5.
// Decisiones de la puerta 1: D1 nombre actual del producto; D2 forma de la respuesta; D3 formato validado en el servicio sin consultar
// PostgreSQL; D4 findCustomerOrder(customerId, orderNumber) filtra ambos campos en la misma consulta y devuelve null si no coincide.
// Interfaz asumida: createOrderService({ prisma }).findCustomerOrder(customerId, orderNumber) ->
//   { orderNumber, status, totalAmount: string, items: [{ productId, productName, quantity, unitPrice: string, subtotal: string }] } | null
// Datos propios: la limpieza global de test:db vacía la base antes de cada test. Matriz: docs/qa/TK-06.3-matrix.md

interface FoundOrder {
  orderNumber: string;
  status: string;
  totalAmount: string;
  items: { productId: number; productName: string; quantity: number; unitPrice: string; subtotal: string }[];
}
interface LookupService {
  findCustomerOrder(customerId: number, orderNumber: string): Promise<FoundOrder | null>;
}
type Store = NonNullable<CreateAppOptions['chatSessionStore']>;

const ACTIVE_PHONE = '+56912345678';
const OTHER_PHONE = '+56987654321';
const NOT_FOUND = 'Pedido no encontrado';
const OLD_NAME_A = 'Alcohol gel QA';
const NAME_A = 'Alcohol en gel renombrado QA';
const NAME_B = 'Bata desechable QA';
const NAME_FOREIGN = 'Casco ajeno QA';

let db: Db;

beforeAll(async () => {
  db = await connectTestPrisma();
});
afterAll(async () => {
  await db?.$disconnect();
});

/**
 * Cliente X (sesión) con MED-00042 en PROCESSING (B × 3 a 50.50 y A × 2 a 100.00, insertados en orden inverso de productId; total 351.50);
 * cliente Y con MED-00043 (C × 4 a 120.00; total 480.00). Después de crear los pedidos el operador renombra A y cambia su precio.
 */
async function seed() {
  const x = (await db.customer.create({ data: { businessName: 'Clínica Los Andes', taxId: '76.111.111-1', phone: ACTIVE_PHONE } })).id;
  const y = (await db.customer.create({ data: { businessName: 'Farmacia Ajena QA', taxId: '76.222.222-2', phone: OTHER_PHONE } })).id;
  const a = await insertProduct(db, { name: OLD_NAME_A, price: '100.00' });
  const b = await insertProduct(db, { name: NAME_B, price: '50.50' });
  const c = await insertProduct(db, { name: NAME_FOREIGN, price: '120.00' });
  const own = await db.order.create({
    data: {
      orderNumber: 'MED-00042',
      customerId: x,
      status: 'PROCESSING',
      totalAmount: '351.50',
      items: {
        create: [
          { productId: b, quantity: 3, unitPrice: '50.50' },
          { productId: a, quantity: 2, unitPrice: '100.00' },
        ],
      },
    },
  });
  await db.order.create({
    data: {
      orderNumber: 'MED-00043',
      customerId: y,
      status: 'DELIVERED',
      totalAmount: '480.00',
      items: { create: [{ productId: c, quantity: 4, unitPrice: '120.00' }] },
    },
  });
  await db.product.update({ where: { id: a }, data: { name: NAME_A, price: '999.00' } });
  return { x, y, a, b, c, ownId: own.id };
}

const lookupService = (prisma: Db = db): LookupService => createOrderService({ prisma }) as unknown as LookupService;

function build(prisma: Db = db): { app: Express; store: Store } {
  const store: Store = new ChatSessionStore({ ttlMinutes: 30 });
  const options = { auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' }, prisma, chatSessionStore: store };
  return { app: createApp(options as unknown as CreateAppOptions), store };
}

/** Envía un mensaje, exige 200 con la forma de ChatReply y devuelve los textos del bot. */
async function say(app: Express, id: string, text: string): Promise<string[]> {
  const res: Response = await request(app)
    .post(`/api/v1/chat/sessions/${id}/messages`)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ text }));
  expect(res.status).toBe(200);
  expect(Object.keys(res.body).sort()).toEqual(['active', 'messages', 'sessionId']);
  expect(res.body.active).toBe(true);
  expect(res.body.sessionId).toBe(id);
  expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
  return (res.body.messages as { text: string }[]).map((m) => m.text);
}

/** Sesión del cliente X en ORDER_LOOKUP (`2` en el menú). */
async function openLookup(app: Express, store: Store): Promise<string> {
  const res = await request(app)
    .post('/api/v1/chat/sessions')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ phone: ACTIVE_PHONE }));
  expect(res.status).toBe(201);
  const id = res.body.sessionId as string;
  await say(app, id, '2');
  expect(store.get(id)?.state).toBe('ORDER_LOOKUP');
  return id;
}

/** Texto desde el comienzo de la línea de `from` hasta el comienzo de la línea de `to` (o el final). */
function block(text: string, from: string, to?: string): string {
  const startOfLine = (needle: string): number => text.lastIndexOf('\n', text.indexOf(needle)) + 1;
  expect(text).toContain(from);
  return text.slice(startOfLine(from), to === undefined ? undefined : startOfLine(to));
}

const masked = (messages: string[], orderNumber: string): string[] => messages.map((m) => m.split(orderNumber).join('#'));

// ---- Observación de las consultas de pedidos (RN-08, D4) ----

const isOrderCall = (call: SpyCall): boolean =>
  /^order(Item)?\./.test(call.path) || (call.path.startsWith('$') && /\border(s|_items)\b/i.test(rawSql(call.args).sql));

/** Busca en cualquier nivel del `where` la condición `key = value` (directa o con `equals`). */
function hasCondition(where: unknown, key: string, value: unknown): boolean {
  if (typeof where !== 'object' || where === null) return false;
  return Object.entries(where).some(
    ([k, v]) => (k === key && (v === value || (v as { equals?: unknown } | null)?.equals === value)) || hasCondition(v, key, value),
  );
}

/** La consulta filtra a la vez por el cliente y por el número de pedido. */
function filtersByOwnerAndNumber(call: SpyCall, customerId: number, orderNumber: string): boolean {
  if (call.path.startsWith('$')) {
    const { sql, values } = rawSql(call.args);
    return /customer_id/i.test(sql) && /order_number/i.test(sql) && values.includes(customerId) && values.includes(orderNumber);
  }
  const where = (call.args[0] as { where?: Record<string, unknown> } | undefined)?.where;
  const byOwner = hasCondition(where, 'customerId', customerId) || hasCondition(where?.customer, 'id', customerId);
  return byOwner && hasCondition(where, 'orderNumber', orderNumber);
}

const isEmptyResult = (result: unknown): boolean => result === null || result === 0 || (Array.isArray(result) && result.length === 0);

/** Rutas de las claves relacionadas con reclamos en cualquier nivel (RE es V2). */
function claimKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(/claim|reclam/i.test(k) ? [`${prefix}${k}`] : []),
    ...claimKeys(v, `${prefix}${k}.`),
  ]);
}

describe('TK-06.3 · spec 04 ESC-35 · consulta propia por número y cliente (RN-08, CA-07, D-08, US-06 crit. 1 y 2)', () => {
  test('spec 04 ESC-35 · CA-07 · X consulta `MED-00042` (lo devuelve: nombre actual, precio guardado, ítems por productId), `MED-00043` y `MED-99999` (null sin distinción)', async () => {
    const { x, y, a, b } = await seed();
    const service = lookupService();

    expect(await service.findCustomerOrder(x, 'MED-00042')).toEqual({
      orderNumber: 'MED-00042',
      status: 'PROCESSING',
      totalAmount: '351.50',
      items: [
        { productId: a, productName: NAME_A, quantity: 2, unitPrice: '100.00', subtotal: '200.00' },
        { productId: b, productName: NAME_B, quantity: 3, unitPrice: '50.50', subtotal: '151.50' },
      ],
    });
    expect(await service.findCustomerOrder(x, 'MED-00043')).toBeNull();
    expect(await service.findCustomerOrder(x, 'MED-99999')).toBeNull();
    // Control: MED-00043 existe y su propietario sí lo obtiene.
    expect(await service.findCustomerOrder(y, 'MED-00043')).toMatchObject({ orderNumber: 'MED-00043' });
  });

  test('spec 04 ESC-35 · RN-08 · D4 · cada consulta de pedidos filtra a la vez por cliente y número; el pedido ajeno nunca se lee', async () => {
    const { x } = await seed();

    for (const orderNumber of ['MED-00042', 'MED-00043']) {
      const spy = spyOnPrisma(db);
      const found = await lookupService(spy.prisma).findCustomerOrder(x, orderNumber);

      const orderCalls = spy.calls.filter(isOrderCall);
      expect(orderCalls.length).toBeGreaterThanOrEqual(1);
      const queries = orderCalls.filter((c) => !c.path.startsWith('orderItem.'));
      expect(queries.length).toBeGreaterThanOrEqual(1);
      expect(queries.filter((c) => !filtersByOwnerAndNumber(c, x, orderNumber)).map((c) => ({ path: c.path, args: c.args }))).toEqual([]);
      if (orderNumber === 'MED-00043') {
        expect(found).toBeNull();
        // Ninguna consulta devuelve datos del pedido ajeno (descarta "buscar por número y comprobar después el propietario").
        expect(orderCalls.filter((c) => !isEmptyResult(c.result)).map((c) => c.path)).toEqual([]);
      }
    }
  });
});

describe('TK-06.3 · spec 04 ESC-36 · sin cancelación por el cliente ni reclamos (CH-09 y RE son V2)', () => {
  test('spec 04 ESC-36 · el contrato solo tiene las dos operaciones de chat y ninguna ruta ni operación de cancelación o reclamos', () => {
    const contract = readFileSync(path.resolve(__dirname, '../../../docs/openapi.yaml'), 'utf8');
    const paths = [...contract.matchAll(/^ {2}(\/\S*):\s*$/gm)].map((m) => m[1]);
    const operationIds = [...contract.matchAll(/^\s+operationId:\s*(\S+)/gm)].map((m) => m[1]);

    expect(paths.filter((p) => p.startsWith('/chat'))).toEqual(['/chat/sessions', '/chat/sessions/{sessionId}/messages']);
    expect(operationIds).toContain('sendChatMessage');
    expect(paths.filter((p) => /claim|reclam|cancel/i.test(p))).toEqual([]);
    expect(operationIds.filter((o) => /claim|reclam|cancel/i.test(o))).toEqual([]);
  });

  test('spec 04 ESC-36 · el servicio ofrece la consulta del cliente sin operaciones de cancelación del cliente ni reclamos; ni ella ni getOrder incluyen reclamos', async () => {
    const { x, ownId } = await seed();
    const service = createOrderService({ prisma: db });

    expect(Object.keys(service).filter((k) => /cancel|claim|reclam/i.test(k))).toEqual([]);
    expect(Object.keys(service)).toContain('findCustomerOrder');

    const found = await lookupService().findCustomerOrder(x, 'MED-00042');
    expect(found).not.toBeNull();
    expect(claimKeys(found)).toEqual([]);
    expect(claimKeys(await service.getOrder(ownId))).toEqual([]);
  });
});

describe('TK-06.3 · spec 03 ESC-39 / ESC-40 · "Mis pedidos" por sendChatMessage contra PostgreSQL (CH-08 MVP, RN-08, CA-07)', () => {
  test('spec 03 ESC-39 · `MED-00042` propio en PROCESSING: número, estado, ítems por productId con nombre actual y precio guardado, total; sin reclamos ni cancelación; sigue en ORDER_LOOKUP sin cambiar pedidos', async () => {
    await seed();
    const { app, store } = build();
    const id = await openLookup(app, store);
    const before = await persistedOrders(db);

    const messages = await say(app, id, 'MED-00042');

    expect(messages).toHaveLength(2); // D2
    const [detail, invitation] = messages;
    expect(detail).toContain('MED-00042');
    expect(detail).toContain('PROCESSING');
    expect(detail.indexOf(NAME_A)).toBeGreaterThanOrEqual(0);
    expect(detail.indexOf(NAME_A)).toBeLessThan(detail.indexOf(NAME_B)); // ordenadas por productId
    const lineA = block(detail, NAME_A, NAME_B);
    expect(lineA).toMatch(/[×x]\s*2(?!\d|[.,]\d)/);
    expect(lineA).toContain('$100.00'); // precio guardado en el pedido
    expect(lineA).toContain('$200.00');
    const lineB = block(detail, NAME_B);
    expect(lineB).toMatch(/[×x]\s*3(?!\d|[.,]\d)/);
    expect(lineB).toContain('$50.50');
    expect(lineB).toContain('$151.50');
    expect(detail.split('\n').some((l) => /\btotal\b/i.test(l) && l.includes('$351.50'))).toBe(true);
    const everything = messages.join('\n');
    expect(everything).not.toContain(OLD_NAME_A); // D1: nombre actual
    expect(everything).not.toContain('999.00'); // no el precio vigente
    expect(everything).not.toMatch(/reclam|cancel|anular/i);
    expect(invitation).toMatch(/(?<![\w$.,-])0(?!\w|[.,]\d)/);
    expect(store.get(id)?.state).toBe('ORDER_LOOKUP');
    expect(await persistedOrders(db)).toEqual(before);
  });

  test('spec 03 ESC-40 · CA-07 · `MED-00043` de otro cliente: "Pedido no encontrado" sin datos del pedido, igual que `MED-99999`; sigue en ORDER_LOOKUP', async () => {
    await seed();
    const { app, store } = build();
    const id = await openLookup(app, store);

    const foreign = await say(app, id, 'MED-00043');

    const text = foreign.join('\n');
    expect(text).toContain(NOT_FOUND);
    for (const leaked of ['DELIVERED', NAME_FOREIGN, '480.00', '120.00', 'Farmacia Ajena']) {
      expect(text).not.toContain(leaked);
    }
    expect(store.get(id)?.state).toBe('ORDER_LOOKUP');

    const missing = await say(app, id, 'MED-99999');
    expect(masked(foreign, 'MED-00043')).toEqual(masked(missing, 'MED-99999')); // D-12
  });
});

describe('TK-06.3 · entrada con carácter nulo U+0000 en "Mis pedidos" (D3, D-12)', () => {
  test('U+0000 dentro de un número de pedido: 200 con "Pedido no encontrado" y ninguna consulta a PostgreSQL; sigue en ORDER_LOOKUP', async () => {
    await seed();
    const input = 'MED-000\u000042';
    // Premisa: si ese texto llegara a PostgreSQL, la consulta fallaría (sería un 500).
    await expect(db.order.findFirst({ where: { orderNumber: input } })).rejects.toThrow();
    const spy = spyOnPrisma(db);
    const { app, store } = build(spy.prisma);
    const id = await openLookup(app, store);
    const before = spy.calls.length;

    const messages = await say(app, id, input);

    expect(messages.join('\n')).toContain(NOT_FOUND);
    expect(spy.calls.slice(before).map((c) => c.path)).toEqual([]);
    expect(store.get(id)?.state).toBe('ORDER_LOOKUP');

    // Control del espía: un número completo sí consulta la base por este mismo camino.
    await say(app, id, 'MED-00042');
    expect(spy.calls.length).toBeGreaterThan(before);
  });
});
