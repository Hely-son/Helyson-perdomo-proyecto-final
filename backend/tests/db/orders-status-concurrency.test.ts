import { AppError } from '../../src/lib/app-error';
import { createOrderService } from '../../src/modules/orders/orders.service';
import {
  changeStatus,
  confirm,
  type ConfirmResult,
  holdRowLock,
  insertCustomer,
  insertOrder,
  orderCounts,
  persistedOrders,
  type OrderStatus,
  type Settled,
  settle,
  statusOf,
  stockOf,
} from './helpers/orders';
import { connectTestPrisma, type Db, insertProduct } from './helpers/products';

// Pruebas de concurrencia de TK-06.1 (RNF-04, RN-05, CA-12 (c)) con conexiones reales contra PostgreSQL (medsupply_test, RNF-01).
// Escenarios: spec 04 ESC-26 ≡ spec 02 ESC-30 (N cancelaciones en paralelo), ESC-27 (avance y cancelación en paralelo) y ESC-29
// (cancelación de A+B con confirmación de B+A). Matriz: docs/qa/TK-06.1-matrix.md.
//
// CRITERIO (puerta 1): en toda prueba concurrente se verifica el estado final del pedido Y el efecto sobre el stock: exactamente una
// restitución (nunca duplicada ni perdida) y stock final = inicial + restituido − confirmado. No basta con "uno gana y otro recibe 409".
//
// Dos modalidades, sin esperas artificiales:
//  - Ráfaga: Promise.allSettled de las operaciones del servicio real (varias conexiones del pool de Prisma), varias rondas.
//  - Forzada: una conexión de la prueba retiene `SELECT … FOR UPDATE` sobre una fila; se lanzan las operaciones, se espera con
//    `waitForLockWaiters` (pg_stat_activity) a que estén bloqueadas y se libera. Es el bloqueo real de PostgreSQL (patrón de
//    TK-03.1/03.3/05.3/05.5); la cola de bloqueos fija el orden de aplicación y el resultado es determinista.
//    Supone lo que la spec fija (F-4, F-5, D-05): la primera escritura de la cancelación es la actualización condicional del pedido
//    y la restitución recorre los productos en orden ascendente de productId.
// Cada prueba (y cada ronda) crea sus propios clientes, productos y pedidos.

jest.setTimeout(90_000);

const N = 6; // por debajo del tamaño del pool de Prisma (10), para que todas las sesiones lleguen a la base a la vez
const ROUNDS = 8;
const ROUNDS_MIXED = 20;

let db: Db;
let service: ReturnType<typeof createOrderService>;

beforeAll(async () => {
  db = await connectTestPrisma();
  service = createOrderService({ prisma: db });
});
afterAll(async () => {
  await db?.$disconnect();
});

const isTransitionError = (e: unknown): boolean => e instanceof AppError && e.status === 409 && e.code === 'INVALID_ORDER_TRANSITION';

/** Exige que ninguna operación haya terminado con un error interno: solo éxito o INVALID_ORDER_TRANSITION. */
function expectOnlyDomainOutcomes(results: Settled<unknown>[]): void {
  const unexpected = results.flatMap((r) => (r.ok || isTransitionError(r.error) ? [] : [String((r.error as Error)?.stack ?? r.error)]));
  expect(unexpected).toEqual([]);
}

const winners = <T>(results: Settled<T>[]) => results.flatMap((r) => (r.ok ? [r.value] : []));
const losers = <T>(results: Settled<T>[]) => results.flatMap((r) => (r.ok ? [] : [r.error]));

/**
 * Pedido con una línea por producto. `stock` es el stock actual del producto (el fixture no descuenta nada): la prueba razona
 * sobre "stock final = stock actual + restituido".
 */
async function setupOrder(status: OrderStatus, lines: { quantity: number; stock: number }[], tag: string) {
  const customerId = await insertCustomer(db);
  const productIds: number[] = [];
  for (const [i, line] of lines.entries()) {
    productIds.push(await insertProduct(db, { name: `${tag} P${i}`, price: '100.00', currentStock: line.stock }));
  }
  const order = await insertOrder(db, {
    customerId,
    status,
    items: lines.map((line, i) => ({ productId: productIds[i], quantity: line.quantity, unitPrice: '100.00' })),
  });
  return { customerId, productIds, ...order };
}

/** Stock esperado: stock actual de cada línea + su cantidad si se restituyó. */
function expectedStock(productIds: number[], lines: { quantity: number; stock: number }[], restituted: boolean): Record<number, number> {
  return Object.fromEntries(productIds.map((id, i) => [id, lines[i].stock + (restituted ? lines[i].quantity : 0)]));
}

// ---------------------------------------------------------------------------------------------
// ESC-26 ≡ ESC-30 (spec 02) · N cancelaciones en paralelo del mismo pedido
// ---------------------------------------------------------------------------------------------

describe('TK-06.1 · ESC-26 ≡ ESC-30 (spec 02) / CA-12 (c) / RNF-04 · N cancelaciones en paralelo: exactamente una gana y el stock se restituye una sola vez', () => {
  test(`ESC-30 (spec 02) · PROCESSING con 3 uds de un producto con stock 7; ${N} cancelaciones simultáneas retenidas en el bloqueo del pedido: 1 éxito, ${N - 1} INVALID_ORDER_TRANSITION, stock 10`, async () => {
    const lines = [{ quantity: 3, stock: 7 }];
    const { id, orderNumber, productIds } = await setupOrder('PROCESSING', lines, 'ESC-30');
    const lock = await holdRowLock('orders', id);
    let pending: Promise<Settled<unknown>>[] = [];
    let blocked = false;
    try {
      pending = Array.from({ length: N }, () => settle(changeStatus(service, id, 'CANCELLED')));
      blocked = await lock.waitForWaiters(N); // las N sesiones están realmente esperando a la vez en PostgreSQL
    } finally {
      await lock.release();
    }
    const results = await Promise.all(pending);

    expect(blocked).toBe(true);
    expectOnlyDomainOutcomes(results);
    expect(winners(results)).toEqual([{ id, orderNumber, status: 'CANCELLED' }]);
    expect(losers(results)).toHaveLength(N - 1);
    expect(await statusOf(db, id)).toBe('CANCELLED');
    expect(await stockOf(db, productIds)).toEqual({ [productIds[0]]: 10 }); // restituido una sola vez: ni 7, ni 13, ni 16
  });

  test(`ESC-26 · ráfaga de ${N} cancelaciones por ronda (${ROUNDS} rondas, PENDING y PROCESSING, 2 productos): 1 éxito, ${N - 1} INVALID_ORDER_TRANSITION, estado CANCELLED y stock restituido exactamente una vez`, async () => {
    const lines = [
      { quantity: 2, stock: 8 },
      { quantity: 1, stock: 4 },
    ];
    for (let round = 0; round < ROUNDS; round++) {
      const status: OrderStatus = round % 2 === 0 ? 'PROCESSING' : 'PENDING';
      const { id, orderNumber, productIds } = await setupOrder(status, lines, `ESC-26 r${round}`);

      const results = await Promise.all(Array.from({ length: N }, () => settle(changeStatus(service, id, 'CANCELLED'))));

      expectOnlyDomainOutcomes(results);
      expect({ round, wins: winners(results) }).toEqual({ round, wins: [{ id, orderNumber, status: 'CANCELLED' }] });
      expect(losers(results)).toHaveLength(N - 1);
      expect(await statusOf(db, id)).toBe('CANCELLED');
      expect({ round, stock: await stockOf(db, productIds) }).toEqual({ round, stock: expectedStock(productIds, lines, true) });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-27 · avance y cancelación en paralelo
// ---------------------------------------------------------------------------------------------

describe('TK-06.1 · ESC-27 / RN-05 / D-06 · avanzar a DISPATCHED y cancelar en paralelo: exactamente uno gana', () => {
  const lines = [
    { quantity: 3, stock: 7 },
    { quantity: 1, stock: 2 },
  ];

  test('ESC-27 (forzada, el avance entra primero) · gana el avance: pedido DISPATCHED, la cancelación recibe INVALID_ORDER_TRANSITION y el stock no cambia', async () => {
    const { id, orderNumber, productIds } = await setupOrder('PROCESSING', lines, 'ESC-27 avance');
    const lock = await holdRowLock('orders', id);
    let advance: Promise<Settled<unknown>>;
    let cancel: Promise<Settled<unknown>>;
    const blocked: boolean[] = [];
    try {
      advance = settle(changeStatus(service, id, 'DISPATCHED'));
      blocked.push(await lock.waitForWaiters(1));
      cancel = settle(changeStatus(service, id, 'CANCELLED'));
      blocked.push(await lock.waitForWaiters(2));
    } finally {
      await lock.release();
    }
    const [advanced, cancelled] = await Promise.all([advance, cancel]);

    expect(blocked).toEqual([true, true]);
    expect(advanced).toEqual({ ok: true, value: { id, orderNumber, status: 'DISPATCHED' } });
    expect(cancelled.ok).toBe(false);
    expect(isTransitionError((cancelled as { error: unknown }).error)).toBe(true);
    expect(await statusOf(db, id)).toBe('DISPATCHED');
    expect(await stockOf(db, productIds)).toEqual(expectedStock(productIds, lines, false)); // avanzar no toca el stock (D-07)
  });

  test('ESC-27 (forzada, la cancelación entra primero) · gana la cancelación: pedido CANCELLED con stock restituido una vez y el avance recibe INVALID_ORDER_TRANSITION', async () => {
    const { id, orderNumber, productIds } = await setupOrder('PROCESSING', lines, 'ESC-27 cancelación');
    const lock = await holdRowLock('orders', id);
    let advance: Promise<Settled<unknown>>;
    let cancel: Promise<Settled<unknown>>;
    const blocked: boolean[] = [];
    try {
      cancel = settle(changeStatus(service, id, 'CANCELLED'));
      blocked.push(await lock.waitForWaiters(1));
      advance = settle(changeStatus(service, id, 'DISPATCHED'));
      blocked.push(await lock.waitForWaiters(2));
    } finally {
      await lock.release();
    }
    const [cancelled, advanced] = await Promise.all([cancel, advance]);

    expect(blocked).toEqual([true, true]);
    expect(cancelled).toEqual({ ok: true, value: { id, orderNumber, status: 'CANCELLED' } });
    expect(advanced.ok).toBe(false);
    expect(isTransitionError((advanced as { error: unknown }).error)).toBe(true);
    expect(await statusOf(db, id)).toBe('CANCELLED');
    expect(await stockOf(db, productIds)).toEqual(expectedStock(productIds, lines, true));
  });

  test(`ESC-27 (ráfaga, ${ROUNDS_MIXED} rondas) · acepta cualquiera de los dos ganadores; siempre exactamente uno, estado final coherente con el ganador y stock coherente (restituido una vez solo si ganó la cancelación)`, async () => {
    for (let round = 0; round < ROUNDS_MIXED; round++) {
      const { id, orderNumber, productIds } = await setupOrder('PROCESSING', lines, `ESC-27 r${round}`);

      const [advanced, cancelled] = await Promise.all([
        settle(changeStatus(service, id, 'DISPATCHED')),
        settle(changeStatus(service, id, 'CANCELLED')),
      ]);

      expectOnlyDomainOutcomes([advanced, cancelled]);
      expect({ round, exactlyOne: Number(advanced.ok) + Number(cancelled.ok) }).toEqual({ round, exactlyOne: 1 });
      const finalStatus = await statusOf(db, id);
      if (advanced.ok) {
        expect(advanced.value).toEqual({ id, orderNumber, status: 'DISPATCHED' });
        expect({ round, finalStatus }).toEqual({ round, finalStatus: 'DISPATCHED' });
        expect({ round, stock: await stockOf(db, productIds) }).toEqual({ round, stock: expectedStock(productIds, lines, false) });
      } else {
        expect(cancelled.ok && cancelled.value).toEqual({ id, orderNumber, status: 'CANCELLED' });
        expect({ round, finalStatus }).toEqual({ round, finalStatus: 'CANCELLED' });
        expect({ round, stock: await stockOf(db, productIds) }).toEqual({ round, stock: expectedStock(productIds, lines, true) });
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-29 · cancelación de un pedido con A y B en paralelo con la confirmación de otro con B y A
// ---------------------------------------------------------------------------------------------

describe('TK-06.1 · ESC-29 / D-05 / RNF-04 · cancelación (A, B) y confirmación (B, A) en paralelo', () => {
  const CART_BA = (a: number, b: number) => [
    { productId: b, quantity: 1, shownUnitPrice: '50.00' },
    { productId: a, quantity: 1, shownUnitPrice: '100.00' },
  ];

  async function twoProducts(tag: string, stockA: number, stockB: number) {
    const a = await insertProduct(db, { name: `${tag} A`, price: '100.00', currentStock: stockA });
    const b = await insertProduct(db, { name: `${tag} B`, price: '50.00', currentStock: stockB });
    return { a, b };
  }

  test(`ESC-29 · con stock para ambas (${ROUNDS_MIXED} rondas): sin interbloqueo ni error interno; ambas terminan; stock final = inicial + restituido − confirmado`, async () => {
    for (let round = 0; round < ROUNDS_MIXED; round++) {
      const { a, b } = await twoProducts(`ESC-29 r${round}`, 5, 5);
      const [owner, buyer] = await Promise.all([insertCustomer(db), insertCustomer(db)]);
      const orderX = await insertOrder(db, {
        customerId: owner,
        status: round % 2 === 0 ? 'PENDING' : 'PROCESSING',
        items: [
          { productId: a, quantity: 2, unitPrice: '100.00' },
          { productId: b, quantity: 1, unitPrice: '50.00' },
        ],
      });
      const before = await orderCounts(db);

      const [cancelled, confirmed] = await Promise.all([
        settle(changeStatus(service, orderX.id, 'CANCELLED')),
        settle(confirm(service, { customerId: buyer, items: CART_BA(a, b) })),
      ]);

      expect(cancelled).toEqual({ ok: true, value: { id: orderX.id, orderNumber: orderX.orderNumber, status: 'CANCELLED' } });
      expect(confirmed.ok).toBe(true); // ninguna terminó con error interno
      const result = (confirmed as { ok: true; value: ConfirmResult }).value;
      expect({ round, ok: result.ok }).toEqual({ round, ok: true });
      // A: 5 + 2 (restituido) − 1 (confirmado) = 6 · B: 5 + 1 − 1 = 5
      expect({ round, stock: await stockOf(db, [a, b]) }).toEqual({ round, stock: { [a]: 6, [b]: 5 } });
      expect(await statusOf(db, orderX.id)).toBe('CANCELLED');
      const after = await orderCounts(db);
      expect({ orders: after.orders - before.orders, items: after.items - before.items }).toEqual({ orders: 1, items: 2 });
      const created = (await persistedOrders(db)).filter((o) => o.customer_id === buyer);
      expect(created.map((o) => ({ status: o.status, items: o.items.map((i) => i.product_id) }))).toEqual([{ status: 'PENDING', items: [a, b] }]);
    }
  });

  test(`ESC-29 (stock escaso, ${ROUNDS_MIXED} rondas) · la confirmación depende de la restitución: confirmada o rechazada con STOCK_INSUFFICIENT, nunca error; el balance de stock cuadra en ambos casos`, async () => {
    for (let round = 0; round < ROUNDS_MIXED; round++) {
      const { a, b } = await twoProducts(`ESC-29 escaso r${round}`, 0, 0);
      const [owner, buyer] = await Promise.all([insertCustomer(db), insertCustomer(db)]);
      const orderX = await insertOrder(db, {
        customerId: owner,
        status: 'PENDING',
        items: [
          { productId: a, quantity: 2, unitPrice: '100.00' },
          { productId: b, quantity: 1, unitPrice: '50.00' },
        ],
      });

      const [cancelled, confirmed] = await Promise.all([
        settle(changeStatus(service, orderX.id, 'CANCELLED')),
        settle(confirm(service, { customerId: buyer, items: CART_BA(a, b) })),
      ]);

      expect(cancelled.ok).toBe(true);
      expect(confirmed.ok).toBe(true); // sin error interno
      const result = (confirmed as { ok: true; value: ConfirmResult }).value;
      const confirmedQty = result.ok ? 1 : 0;
      if (!result.ok) {
        expect(result.rejections.map((r) => r.reason)).toEqual(Array(result.rejections.length).fill('STOCK_INSUFFICIENT'));
      }
      expect({ round, stock: await stockOf(db, [a, b]) }).toEqual({ round, stock: { [a]: 0 + 2 - confirmedQty, [b]: 0 + 1 - confirmedQty } });
      expect(await statusOf(db, orderX.id)).toBe('CANCELLED');
      expect((await persistedOrders(db)).filter((o) => o.customer_id === buyer)).toHaveLength(confirmedQty);
    }
  });

  // Variantes forzadas: stock SUFICIENTE (A 5, B 5), de modo que el descuento de la confirmación (`WHERE current_stock >= qty`)
  // cumple el filtro en su snapshot y por tanto SÍ intenta actualizar la fila bloqueada y se encola (contención real). Con stock 0
  // PostgreSQL omitiría la fila sin esperar y la prueba no probaría nada. La cobertura con stock escaso está en las rondas en ráfaga.
  // Cantidades: pedido X (A × 2, B × 1) y confirmación de B × 1 + A × 1. Stock final = inicial + restituido − confirmado:
  // A = 5 + 2 − 1 = 6; B = 5 + 1 − 1 = 5, tanto si la cancelación entra primero como si lo hace la confirmación.
  test.each<['cancelación' | 'confirmación']>([['cancelación'], ['confirmación']])(
    'ESC-29 (forzada, la %s entra primero) · ambas retenidas en el bloqueo de A con stock suficiente: ambas terminan, pedido X CANCELLED, un pedido nuevo PENDING del comprador y stock final A 6, B 5',
    async (first) => {
      const { a, b } = await twoProducts(`ESC-29 forzada ${first}`, 5, 5);
      const [owner, buyer] = await Promise.all([insertCustomer(db), insertCustomer(db)]);
      const orderX = await insertOrder(db, {
        customerId: owner,
        status: 'PENDING',
        items: [
          { productId: a, quantity: 2, unitPrice: '100.00' },
          { productId: b, quantity: 1, unitPrice: '50.00' },
        ],
      });
      const before = await orderCounts(db);
      const startCancel = () => settle(changeStatus(service, orderX.id, 'CANCELLED'));
      const startBuy = () => settle(confirm(service, { customerId: buyer, items: CART_BA(a, b) }));

      const lock = await holdRowLock('products', a);
      let cancel: Promise<Settled<unknown>>;
      let buy: Promise<Settled<ConfirmResult>>;
      const blocked: boolean[] = [];
      try {
        if (first === 'cancelación') {
          cancel = startCancel();
          blocked.push(await lock.waitForWaiters(1));
          buy = startBuy();
          blocked.push(await lock.waitForWaiters(2));
        } else {
          buy = startBuy();
          blocked.push(await lock.waitForWaiters(1));
          cancel = startCancel();
          blocked.push(await lock.waitForWaiters(2));
        }
      } finally {
        await lock.release();
      }
      const [cancelled, confirmed] = await Promise.all([cancel, buy]);

      // Contención real: las dos sesiones estuvieron esperando el bloqueo de A, una tras otra.
      expect(blocked).toEqual([true, true]);
      // Ninguna terminó con error interno.
      expect(cancelled).toEqual({ ok: true, value: { id: orderX.id, orderNumber: orderX.orderNumber, status: 'CANCELLED' } });
      expect(confirmed.ok).toBe(true);
      const result = (confirmed as { ok: true; value: ConfirmResult }).value;
      expect(result.ok).toBe(true); // con stock suficiente la confirmación siempre se confirma, gane quien gane
      const newOrder = result.ok ? result.order : undefined;

      // Estado final de ambos pedidos.
      expect(await statusOf(db, orderX.id)).toBe('CANCELLED');
      const buyerOrders = (await persistedOrders(db)).filter((o) => o.customer_id === buyer);
      expect(buyerOrders.map((o) => ({ id: o.id, status: o.status, items: o.items.map((i) => ({ p: i.product_id, q: i.quantity })) }))).toEqual([
        { id: newOrder?.id, status: 'PENDING', items: [{ p: a, q: 1 }, { p: b, q: 1 }] },
      ]);
      const after = await orderCounts(db);
      expect({ orders: after.orders - before.orders, items: after.items - before.items }).toEqual({ orders: 1, items: 2 });

      // Stock sin pérdida ni duplicación: inicial + restituido − confirmado, recalculado.
      const initial = { a: 5, b: 5 };
      const restituted = { a: 2, b: 1 }; // una sola vez, por la cancelación de X
      const bought = { a: 1, b: 1 }; // por la confirmación del comprador
      expect(await stockOf(db, [a, b])).toEqual({
        [a]: initial.a + restituted.a - bought.a,
        [b]: initial.b + restituted.b - bought.b,
      });
    },
  );
});
