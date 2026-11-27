import http from 'node:http';
import type { Express } from 'express';
import type { Client } from 'pg';
import { createApp, type CreateAppOptions } from '../../src/app';
import { ChatSessionStore } from '../../src/modules/chat/session-store';
import { createOrderService } from '../../src/modules/orders/orders.service';
import { type RealServer, withRealServer } from '../helpers/concurrent-http';
import { QA_JWT_SECRET } from '../helpers/jwt';
import {
  type ConfirmItem,
  type ConfirmResult,
  confirm,
  insertCustomer,
  ORDER_NUMBER_FORMAT,
  orderCounts,
  persistedOrders,
  stockOf,
} from './helpers/orders';
import { connectTestPrisma, type Db, insertProduct, waitForLockWaiters } from './helpers/products';
import { connectTestDatabase } from './helpers/test-database';

// TK-05.5 · Pruebas de concurrencia de la confirmación (entrega A), contra PostgreSQL real (medsupply_test, RNF-01).
// Escenarios: spec 04 ESC-09 y ESC-10 (RNF-04 (a) y (b), RN-01, RN-02, CA-05) y spec 03 ESC-35 (DP-08) y ESC-36 (CA-05).
// Backlog TK-05.5 "Hecho cuando" (a), (b) y (c). Matriz: docs/qa/TK-05.5-matrix.md.
//
// Decisión D3 (puerta 1): ESC-09 y ESC-10 llaman en paralelo a `orders.service` (Promise.allSettled, varias conexiones del pool de
// Prisma); ESC-35 y ESC-36 usan peticiones HTTP reales en paralelo (una conexión nueva por petición, `agent: false`) contra la app
// Express montada en un puerto efímero. Sin esperas artificiales: cada ronda es una ráfaga pura de Promise.all / allSettled.
// Cada prueba (y cada ronda) crea sus propios clientes y productos, con nombres únicos; los resultados se comprueban contra el estado
// final de PostgreSQL (stock, pedidos y ítems), no solo contra las respuestas.
//
// Única coordinación con la base en esta entrega: la variante "no espera a la otra sesión" de ESC-35 retiene la fila de A con un
// SELECT … FOR UPDATE desde una conexión de la prueba (patrón ya usado en TK-03.1/03.3/05.3). No cambia ni sustituye ninguna pieza
// de la aplicación: el bloqueo es el de PostgreSQL y el servicio de pedidos es el real.

jest.setTimeout(90_000);

const ROUNDS = 5;
const ROUNDS_ORDERS = 20;

let db: Db;

beforeAll(async () => {
  db = await connectTestPrisma();
});
afterAll(async () => {
  await db?.$disconnect();
});

// ---------------------------------------------------------------------------------------------
// Utilidades del servicio de pedidos
// ---------------------------------------------------------------------------------------------

function settledResults(settled: PromiseSettledResult<ConfirmResult>[]): ConfirmResult[] {
  const failures = settled.flatMap((r) => (r.status === 'rejected' ? [String((r.reason as Error)?.stack ?? r.reason)] : []));
  expect(failures).toEqual([]); // ninguna confirmación termina con error interno
  return settled.map((r) => (r as PromiseFulfilledResult<ConfirmResult>).value);
}

const stockRejection = (productId: number) => ({ productId, reason: 'STOCK_INSUFFICIENT', availableStock: 0 });

// ---------------------------------------------------------------------------------------------
// ESC-09 · N confirmaciones por la última unidad (spec 04; RNF-04 (a); CA-05)
// ---------------------------------------------------------------------------------------------

describe('TK-05.5 · ESC-09 / RNF-04 (a) / CA-05 / RN-01 / RN-02 · confirmaciones paralelas por las últimas unidades (orders.service)', () => {
  const N = 8;

  test(`ESC-09 · A con stock 1; ${N} clientes confirman A × 1 en paralelo (${ROUNDS} rondas): exactamente un pedido, las demás STOCK_INSUFFICIENT y stock final 0`, async () => {
    const service = createOrderService({ prisma: db });
    for (let round = 0; round < ROUNDS; round++) {
      const a = await insertProduct(db, { name: `A última unidad [r${round}]`, price: '100.00', currentStock: 1 });
      const customers = await Promise.all(Array.from({ length: N }, () => insertCustomer(db)));
      const before = await orderCounts(db);

      const settled = await Promise.allSettled(
        customers.map((customerId) => confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] })),
      );
      const results = settledResults(settled);

      const created = results.flatMap((r) => (r.ok ? [r.order] : []));
      const rejected = results.flatMap((r) => (r.ok ? [] : [r.rejections]));
      expect({ round, created: created.length, rejected: rejected.length }).toEqual({ round, created: 1, rejected: N - 1 });
      expect(rejected).toEqual(Array.from({ length: N - 1 }, () => [stockRejection(a)]));
      expect(created[0].orderNumber).toMatch(ORDER_NUMBER_FORMAT);
      expect(created[0].items).toEqual([{ productId: a, quantity: 1, unitPrice: '100.00' }]);

      expect(await stockOf(db, [a])).toEqual({ [a]: 0 });
      const after = await orderCounts(db);
      expect({ orders: after.orders - before.orders, items: after.items - before.items }).toEqual({ orders: 1, items: 1 });
      const winner = (await persistedOrders(db)).filter((o) => o.items.some((i) => i.product_id === a));
      expect(winner.map((o) => o.id)).toEqual([created[0].id]);
    }
  });

  test(`ESC-09 (variante) · A con stock 3; ${N} clientes confirman A × 1 en paralelo: exactamente 3 pedidos, ${N - 3} STOCK_INSUFFICIENT y stock final 0 (nunca negativo)`, async () => {
    const service = createOrderService({ prisma: db });
    const a = await insertProduct(db, { name: 'A tres unidades', price: '100.00', currentStock: 3 });
    const customers = await Promise.all(Array.from({ length: N }, () => insertCustomer(db)));

    const results = settledResults(
      await Promise.allSettled(
        customers.map((customerId) => confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] })),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    const rejected = results.flatMap((r) => (r.ok ? [] : [r.rejections]));
    expect(rejected).toEqual(Array.from({ length: N - 3 }, () => [stockRejection(a)]));
    expect(await stockOf(db, [a])).toEqual({ [a]: 0 });
    expect(await orderCounts(db)).toEqual({ orders: 3, items: 3 });
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-10 · carritos con los mismos productos en orden inverso (spec 04; RNF-04 (b))
// ---------------------------------------------------------------------------------------------

describe('TK-05.5 · ESC-10 / RNF-04 (b) · dos carritos con A y B en orden inverso, en paralelo (orders.service)', () => {
  test(`ESC-10 con stock para ambos (${ROUNDS_ORDERS} rondas): ambas confirmadas, sin error interno ni bloqueo, sin pedidos parciales; stock final = inicial − confirmado`, async () => {
    const service = createOrderService({ prisma: db });
    for (let round = 0; round < ROUNDS_ORDERS; round++) {
      const a = await insertProduct(db, { name: `A ambos [r${round}]`, price: '100.00', currentStock: 5 });
      const b = await insertProduct(db, { name: `B ambos [r${round}]`, price: '50.00', currentStock: 5 });
      const [c1, c2] = await Promise.all([insertCustomer(db), insertCustomer(db)]);
      const before = await orderCounts(db);
      const cartAB: ConfirmItem[] = [
        { productId: a, quantity: 1, shownUnitPrice: '100.00' },
        { productId: b, quantity: 1, shownUnitPrice: '50.00' },
      ];
      const cartBA: ConfirmItem[] = [
        { productId: b, quantity: 1, shownUnitPrice: '50.00' },
        { productId: a, quantity: 1, shownUnitPrice: '100.00' },
      ];

      const results = settledResults(
        await Promise.allSettled([confirm(service, { customerId: c1, items: cartAB }), confirm(service, { customerId: c2, items: cartBA })]),
      );

      expect({ round, ok: results.map((r) => r.ok) }).toEqual({ round, ok: [true, true] });
      expect(await stockOf(db, [a, b])).toEqual({ [a]: 3, [b]: 3 });
      const after = await orderCounts(db);
      expect({ orders: after.orders - before.orders, items: after.items - before.items }).toEqual({ orders: 2, items: 4 });
      for (const order of (await persistedOrders(db)).filter((o) => [c1, c2].includes(o.customer_id))) {
        expect(order.items.map((i) => i.product_id)).toEqual([a, b]); // cada pedido completo: ambos ítems
        expect(order.total_amount).toBe('150.00');
      }
    }
  });

  test(`ESC-10 con stock para uno solo (${ROUNDS_ORDERS} rondas): exactamente un pedido completo, la otra rechazada por STOCK_INSUFFICIENT; sin error interno ni bloqueo ni pedidos parciales; stock final = inicial − confirmado`, async () => {
    const service = createOrderService({ prisma: db });
    for (let round = 0; round < ROUNDS_ORDERS; round++) {
      const a = await insertProduct(db, { name: `A uno [r${round}]`, price: '100.00', currentStock: 1 });
      const b = await insertProduct(db, { name: `B uno [r${round}]`, price: '50.00', currentStock: 1 });
      const [c1, c2] = await Promise.all([insertCustomer(db), insertCustomer(db)]);
      const before = await orderCounts(db);

      const results = settledResults(
        await Promise.allSettled([
          confirm(service, {
            customerId: c1,
            items: [
              { productId: a, quantity: 1, shownUnitPrice: '100.00' },
              { productId: b, quantity: 1, shownUnitPrice: '50.00' },
            ],
          }),
          confirm(service, {
            customerId: c2,
            items: [
              { productId: b, quantity: 1, shownUnitPrice: '50.00' },
              { productId: a, quantity: 1, shownUnitPrice: '100.00' },
            ],
          }),
        ]),
      );

      const created = results.filter((r) => r.ok);
      const rejected = results.flatMap((r) => (r.ok ? [] : [r.rejections]));
      expect({ round, created: created.length, rejected: rejected.length }).toEqual({ round, created: 1, rejected: 1 });
      expect(rejected[0].length).toBeGreaterThan(0);
      expect(rejected[0].every((r) => r.reason === 'STOCK_INSUFFICIENT')).toBe(true);
      expect(await stockOf(db, [a, b])).toEqual({ [a]: 0, [b]: 0 }); // inicial 1 − confirmado 1
      const after = await orderCounts(db);
      expect({ orders: after.orders - before.orders, items: after.items - before.items }).toEqual({ orders: 1, items: 2 });
      const mine = (await persistedOrders(db)).filter((o) => [c1, c2].includes(o.customer_id));
      expect(mine).toHaveLength(1);
      expect(mine[0].items.map((i) => i.product_id)).toEqual([a, b]); // sin pedido parcial
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Chat por HTTP real (ESC-35, ESC-36)
// ---------------------------------------------------------------------------------------------

interface Reply {
  status: number;
  text: string;
  body: { sessionId?: string; active?: boolean; messages?: { text: string }[]; error?: unknown };
}

function postJson(server: RealServer, path: string, body: unknown): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: server.address.address,
        port: server.address.port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) },
        agent: false,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          let parsed: Reply['body'] = {};
          try {
            parsed = raw === '' ? {} : (JSON.parse(raw) as Reply['body']);
          } catch {
            parsed = {};
          }
          resolve({ status: res.statusCode ?? 0, text: (parsed.messages ?? []).map((m) => m.text).join('\n'), body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

type Store = NonNullable<CreateAppOptions['chatSessionStore']>;
interface Chat {
  app: Express;
  store: Store;
}

function buildChat(): Chat {
  const store: Store = new ChatSessionStore({ ttlMinutes: 30 });
  const app = createApp({ auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' }, prisma: db, chatSessionStore: store } as unknown as CreateAppOptions);
  return { app, store };
}

let phoneCounter = 0;

/** Cliente activo propio de la prueba con un teléfono nacional válido y único (+56 9 5055 NNNN). */
async function seedChatCustomer(): Promise<{ id: number; phone: string }> {
  phoneCounter += 1;
  const n = String(phoneCounter).padStart(4, '0');
  const phone = `+5695055${n}`;
  const customer = await db.customer.create({ data: { businessName: `Clínica QA TK-05.5 ${n}`, taxId: `76.055.${n}-5`, phone, isActive: true } });
  return { id: customer.id, phone };
}

const SESSIONS = '/api/v1/chat/sessions';
const lines = (text: string): string[] => text.split('\n').map((l) => l.trim());
const ORDER_NUMBER = /MED-\d{5,}/;

async function openSession(server: RealServer, phone: string): Promise<string> {
  const res = await postJson(server, SESSIONS, { phone });
  expect(res.status).toBe(201);
  return res.body.sessionId as string;
}

async function say(server: RealServer, id: string, text: string): Promise<string> {
  const res = await postJson(server, `${SESSIONS}/${id}/messages`, { text });
  expect(res.status).toBe(200);
  expect(res.body.active).toBe(true);
  return res.text;
}

/** Sesión nueva del cliente con `productName` × `quantity` en el carrito y el resumen mostrado (estado SUMMARY). */
async function sessionAtSummary(server: RealServer, chat: Chat, phone: string, productName: string, quantity: number): Promise<string> {
  const id = await openSession(server, phone);
  const list = await say(server, id, '1');
  const line = lines(list).find((l) => l.includes(productName) && /^\d+\)/.test(l));
  if (!line) throw new Error(`no hay una línea numerada para "${productName}" en:\n${list}`);
  await say(server, id, String(/^(\d+)\)/.exec(line)![1]));
  await say(server, id, String(quantity));
  await say(server, id, '3'); // CART: Confirmar compra → resumen
  expect(chat.store.get(id)?.state).toBe('SUMMARY');
  return id;
}

const hasOption = (text: string, n: number, word: RegExp): boolean => lines(text).some((l) => new RegExp(`^${n}\\)`).test(l) && word.test(l));

// ---------------------------------------------------------------------------------------------
// ESC-36 · dos sesiones de clientes distintos por la última unidad (spec 03; CA-05, RNF-04 (a))
// ---------------------------------------------------------------------------------------------

describe('TK-05.5 · ESC-36 / CA-05 / RN-01 / RN-02 / RNF-04 (a) · dos sesiones por la última unidad (HTTP)', () => {
  test(`ESC-36 · A con stock 1; dos clientes con A × 1 en el resumen envían \`1\` en paralelo (${ROUNDS} rondas): un pedido; la otra sesión recibe ajustar/quitar/cancelar; stock final 0`, async () => {
    const chat = buildChat();
    await withRealServer(chat.app, async (server) => {
      for (let round = 0; round < ROUNDS; round++) {
        const name = `Alcohol gel última [r${round}]`;
        const a = await insertProduct(db, { name, price: '100.00', currentStock: 1 });
        const [c1, c2] = [await seedChatCustomer(), await seedChatCustomer()];
        const s1 = await sessionAtSummary(server, chat, c1.phone, name, 1);
        const s2 = await sessionAtSummary(server, chat, c2.phone, name, 1);
        const before = await orderCounts(db);

        const replies = await Promise.all([
          postJson(server, `${SESSIONS}/${s1}/messages`, { text: '1' }),
          postJson(server, `${SESSIONS}/${s2}/messages`, { text: '1' }),
        ]);

        expect({ round, status: replies.map((r) => r.status) }).toEqual({ round, status: [200, 200] });
        const winners = replies.filter((r) => ORDER_NUMBER.test(r.text));
        const losers = replies.filter((r) => !ORDER_NUMBER.test(r.text));
        expect({ round, winners: winners.length, losers: losers.length }).toEqual({ round, winners: 1, losers: 1 });
        expect(winners[0].text).toContain('PENDING');
        expect(losers[0].text).toContain(name);
        expect(hasOption(losers[0].text, 1, /ajustar/i)).toBe(true);
        expect(hasOption(losers[0].text, 2, /quitar/i)).toBe(true);
        expect(hasOption(losers[0].text, 3, /cancelar/i)).toBe(true);

        const winnerSession = ORDER_NUMBER.test(replies[0].text) ? s1 : s2;
        const loserSession = winnerSession === s1 ? s2 : s1;
        expect(chat.store.get(winnerSession)?.state).toBe('MAIN_MENU');
        expect(chat.store.get(loserSession)?.state).toBe('RESOLVE_STOCK');
        expect(await stockOf(db, [a])).toEqual({ [a]: 0 });
        const after = await orderCounts(db);
        expect({ orders: after.orders - before.orders, items: after.items - before.items }).toEqual({ orders: 1, items: 1 });
        const mine = (await persistedOrders(db)).filter((o) => [c1.id, c2.id].includes(o.customer_id));
        expect(mine).toHaveLength(1);
        expect(mine[0].items).toEqual([{ product_id: a, quantity: 1, unit_price: '100.00' }]);
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-35 · dos confirmaciones simultáneas en la misma sesión (spec 03; DP-08, D-08, CH-06, CH-07)
// ---------------------------------------------------------------------------------------------

describe('TK-05.5 · ESC-35 / DP-08 · confirmaciones simultáneas de la misma sesión (HTTP)', () => {
  test(`ESC-35 · resumen en la sesión 1 (A × 2) y la sesión 2 de otro cliente en MAIN_MENU; dos \`1\` a la sesión 1 y un \`1\` a la sesión 2 en paralelo (${ROUNDS} rondas): exactamente un pedido, el segundo \`1\` muestra el catálogo, carrito vacío y la sesión 2 responde`, async () => {
    const chat = buildChat();
    await withRealServer(chat.app, async (server) => {
      for (let round = 0; round < ROUNDS; round++) {
        const name = `Alcohol gel serie [r${round}]`;
        const a = await insertProduct(db, { name, price: '100.00', currentStock: 10 });
        const [c1, c2] = [await seedChatCustomer(), await seedChatCustomer()];
        const s1 = await sessionAtSummary(server, chat, c1.phone, name, 2);
        const s2 = await openSession(server, c2.phone);
        expect(chat.store.get(s2)?.state).toBe('MAIN_MENU');
        const before = await orderCounts(db);

        const [first, second, other] = await Promise.all([
          postJson(server, `${SESSIONS}/${s1}/messages`, { text: '1' }),
          postJson(server, `${SESSIONS}/${s1}/messages`, { text: '1' }),
          postJson(server, `${SESSIONS}/${s2}/messages`, { text: '1' }),
        ]);

        expect({ round, status: [first.status, second.status, other.status] }).toEqual({ round, status: [200, 200, 200] });
        // Exactamente una de las dos respuestas de la sesión 1 confirma el pedido; la otra se interpreta en MAIN_MENU (catálogo).
        const confirmations = [first, second].filter((r) => ORDER_NUMBER.test(r.text));
        const catalogs = [first, second].filter((r) => !ORDER_NUMBER.test(r.text));
        expect({ round, confirmations: confirmations.length, catalogs: catalogs.length }).toEqual({ round, confirmations: 1, catalogs: 1 });
        expect(confirmations[0].text).toContain('PENDING');
        expect(catalogs[0].text).toContain(name);
        expect(lines(catalogs[0].text).some((l) => l.includes(name) && /^\d+\)/.test(l))).toBe(true);
        // La sesión 2 (MAIN_MENU) interpreta su `1` como catálogo.
        expect(other.text).toContain(name);
        expect(chat.store.get(s2)?.state).toBe('CATALOG');

        // Estado final de la sesión 1: el segundo `1` se interpretó en MAIN_MENU (catálogo), no en SUMMARY; carrito vacío.
        const session1 = chat.store.get(s1);
        expect(session1?.state).toBe('CATALOG');
        expect(session1?.cart).toEqual([]);

        // PostgreSQL: un solo pedido de A × 2 y el stock bajó una sola vez.
        expect(await stockOf(db, [a])).toEqual({ [a]: 8 });
        const after = await orderCounts(db);
        expect({ orders: after.orders - before.orders, items: after.items - before.items }).toEqual({ orders: 1, items: 1 });
        const mine = (await persistedOrders(db)).filter((o) => o.customer_id === c1.id);
        expect(mine).toHaveLength(1);
        expect(mine[0].items).toEqual([{ product_id: a, quantity: 2, unit_price: '100.00' }]);
        expect(mine[0].order_number).toMatch(ORDER_NUMBER_FORMAT);
        expect((await persistedOrders(db)).filter((o) => o.customer_id === c2.id)).toHaveLength(0);
      }
    });
  });

  test('ESC-35 (la otra sesión no espera) · la confirmación de la sesión 1 queda esperando el bloqueo de la fila de A en PostgreSQL; la sesión 2 (otro cliente, B propio) confirma su pedido mientras tanto, sin esperar a la sesión 1; luego se completan los dos mensajes de la sesión 1', async () => {
    const chat = buildChat();
    const nameA = 'Alcohol gel bloqueado A';
    const nameB = 'Bata independiente B';
    const a = await insertProduct(db, { name: nameA, price: '100.00', currentStock: 10 });
    const b = await insertProduct(db, { name: nameB, price: '50.00', currentStock: 5 });
    const [c1, c2] = [await seedChatCustomer(), await seedChatCustomer()];
    const locker: Client = await connectTestDatabase();
    const observer: Client = await connectTestDatabase();
    try {
      await withRealServer(chat.app, async (server) => {
        const s1 = await sessionAtSummary(server, chat, c1.phone, nameA, 2);
        const s2 = await sessionAtSummary(server, chat, c2.phone, nameB, 1); // fila independiente: B, sin relación con A

        // La fila de A queda retenida por PostgreSQL: la confirmación de la sesión 1 (dentro de orders.service) esperará ese bloqueo.
        await locker.query('BEGIN');
        await locker.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [a]);
        const s1Settled: boolean[] = [false, false];
        const p1 = postJson(server, `${SESSIONS}/${s1}/messages`, { text: '1' }).then((r) => ((s1Settled[0] = true), r));
        const p2 = postJson(server, `${SESSIONS}/${s1}/messages`, { text: '1' }).then((r) => ((s1Settled[1] = true), r));
        let p3: Promise<Reply> | undefined;
        try {
          expect(await waitForLockWaiters(observer, 1)).toBe(true); // la sesión 1 está esperando el bloqueo de A

          // La sesión 2 confirma su pedido de B mientras A sigue bloqueada y la sesión 1 sin responder; si B dependiera
          // de A o la sesión 2 esperara a la sesión 1, la petición no respondería y el plazo haría fallar la prueba.
          p3 = postJson(server, `${SESSIONS}/${s2}/messages`, { text: '1' });
          let timer: NodeJS.Timeout | undefined;
          const timeout = new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), 8000)));
          const other = await Promise.race([p3, timeout]);
          clearTimeout(timer);
          expect(other).not.toBe('timeout'); // la sesión 2 debe responder mientras A sigue bloqueada
          expect((other as Reply).status).toBe(200);
          expect((other as Reply).text).toMatch(ORDER_NUMBER);
          expect((other as Reply).text).toContain('PENDING');
          expect(await stockOf(db, [b])).toEqual({ [b]: 4 }); // el pedido de B ya está confirmado en PostgreSQL
          expect(await stockOf(db, [a])).toEqual({ [a]: 10 }); // el de A, no
          expect(s1Settled).toEqual([false, false]); // la sesión 1 seguía esperando cuando la sesión 2 ya había terminado
        } finally {
          await locker.query('COMMIT').catch(() => undefined);
          await Promise.allSettled([p1, p2, ...(p3 ? [p3] : [])]); // sin peticiones colgadas si la prueba falló
        }

        const [first, second] = await Promise.all([p1, p2]);
        expect([first.status, second.status]).toEqual([200, 200]);
        expect([first, second].filter((r) => ORDER_NUMBER.test(r.text))).toHaveLength(1);
        expect(chat.store.get(s1)?.cart).toEqual([]);
        expect(chat.store.get(s2)?.cart).toEqual([]);
        expect(await stockOf(db, [a, b])).toEqual({ [a]: 8, [b]: 4 });
        expect(await orderCounts(db)).toEqual({ orders: 2, items: 2 });
        const orders = await persistedOrders(db);
        expect(orders.find((o) => o.customer_id === c1.id)?.items).toEqual([{ product_id: a, quantity: 2, unit_price: '100.00' }]);
        expect(orders.find((o) => o.customer_id === c2.id)?.items).toEqual([{ product_id: b, quantity: 1, unit_price: '50.00' }]);
      });
    } finally {
      await locker.end().catch(() => undefined);
      await observer.end().catch(() => undefined);
    }
  });
});
