import { AppError } from '../../src/lib/app-error';
import { createOrderService } from '../../src/modules/orders/orders.service';
import { createProductService } from '../../src/modules/products/products.service';
import {
  deductionProductId,
  isDeductionCall,
  prismaKnownError,
  prismaP2034,
  spyOnPrisma,
  type SpyHooks,
} from '../helpers/prisma-spy';
import {
  changeStatus,
  confirm,
  confirmedOrder,
  insertCustomer,
  insertOrder,
  OPERATOR_TARGETS,
  ORDER_NUMBER_FORMAT,
  type OrderStatus,
  orderCounts,
  persistedOrders,
  stockOf,
  statusOf,
} from './helpers/orders';
import { connectTestPrisma, type Db, insertProduct, orderSnapshot } from './helpers/products';

// Pruebas de aceptación de TK-06.1 · transiciones de estado del pedido por el operador, contra PostgreSQL real
// (medsupply_test, RNF-01). Spec 04 F-4, F-5, D-05, D-06, D-07, §11.2 (ESC-16, 17, 18, 20, 21, 22, 24, 25, 28);
// spec 02 F-9 (ESC-14 y ESC-31, este último ≡ spec 04 ESC-28); CA-12 (a), (b); RN-05, RN-09, RN-10.
// ATENCIÓN con los IDs: "ESC-14 (spec 02)" es el ajuste con expectedStock tras cancelar; el ESC-14 de la spec 04 (ROLLBACK de
// la confirmación) es otro escenario, cubierto en TK-05.3.
// La operación probada es `changeOrderStatus(orderId, target)` de `createOrderService` (puerta 1, P2). Los pedidos de partida son
// fixtures Prisma en el estado deseado (`insertOrder`); los que deben ser reales (ESC-14 spec 02, ESC-28) se crean con confirmOrder.
// La concurrencia está en orders-status-concurrency.test.ts. Matriz: docs/qa/TK-06.1-matrix.md.

let db: Db;
let service: ReturnType<typeof createOrderService>;
let customerId: number;

beforeAll(async () => {
  db = await connectTestPrisma();
  service = createOrderService({ prisma: db });
});

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  // test:db vacía la base antes de cada test (reset-before-each.ts): el cliente se crea después.
  customerId = await insertCustomer(db);
});

/** Pedido con A × 2 y B × 1 en el estado dado; stock A 8 y B 4 (valores de ESC-22). */
async function setupOrder(status: OrderStatus) {
  const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 8 });
  const b = await insertProduct(db, { name: 'B', price: '50.00', currentStock: 4 });
  const order = await insertOrder(db, {
    customerId,
    status,
    items: [
      { productId: a, quantity: 2, unitPrice: '100.00' },
      { productId: b, quantity: 1, unitPrice: '50.00' },
    ],
  });
  return { a, b, ...order };
}

/** Todo lo observable de un pedido y de sus productos (incluidos updated_at), para comprobar "sin cambios". */
async function observe(orderId: number, productIds: number[]) {
  return { snapshot: await orderSnapshot(db, orderId), stock: await stockOf(db, productIds), counts: await orderCounts(db) };
}

async function domainError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (e: unknown) => e,
  );
}

async function expectTransitionRejected(orderId: number, target: unknown): Promise<void> {
  const error = await domainError(changeStatus(service, orderId, target));
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ status: 409, code: 'INVALID_ORDER_TRANSITION' });
}

// ---------------------------------------------------------------------------------------------
// Avance de estado (F-4, D-06, D-07)
// ---------------------------------------------------------------------------------------------

describe('TK-06.1 · ESC-16 · avance PENDING → PROCESSING → DISPATCHED → DELIVERED sin tocar el stock (D-07)', () => {
  test('ESC-16 · cada paso responde exactamente { id, orderNumber, status }, persiste el estado y el stock no cambia', async () => {
    const { a, b, id, orderNumber } = await setupOrder('PENDING');
    const before = await observe(id, [a, b]);

    for (const target of ['PROCESSING', 'DISPATCHED', 'DELIVERED'] as const) {
      const result = await changeStatus(service, id, target);

      expect(result).toEqual({ id, orderNumber, status: target });
      expect(result.orderNumber).toMatch(ORDER_NUMBER_FORMAT);
      expect(await statusOf(db, id)).toBe(target);
      expect(await stockOf(db, [a, b])).toEqual({ [a]: 8, [b]: 4 });
    }

    // Solo cambió el estado: ítems, total y conteos intactos; el pedido es el mismo.
    const after = await observe(id, [a, b]);
    expect(after.snapshot.items).toEqual(before.snapshot.items);
    expect(after.snapshot.order.total_amount).toBe(before.snapshot.order.total_amount);
    expect(after.counts).toEqual(before.counts);
    expect((await persistedOrders(db)).find((o) => o.id === id)?.order_number).toBe(orderNumber);
  });
});

describe('TK-06.1 · ESC-17, ESC-18, ESC-20, ESC-21 · transiciones no permitidas (D-06): INVALID_ORDER_TRANSITION y nada cambia', () => {
  test.each<[string, OrderStatus, OrderStatus]>([
    ['ESC-17 · PENDING → DISPATCHED (salto)', 'PENDING', 'DISPATCHED'],
    ['ESC-17 · PENDING → DELIVERED (salto)', 'PENDING', 'DELIVERED'],
    ['ESC-18 · DISPATCHED → PROCESSING (retroceso)', 'DISPATCHED', 'PROCESSING'],
    ['ESC-20 · PROCESSING → PROCESSING (mismo estado, D-06)', 'PROCESSING', 'PROCESSING'],
    ['RN-05 · PROCESSING → DELIVERED (salto)', 'PROCESSING', 'DELIVERED'],
    ['RN-05 · DISPATCHED → DISPATCHED (mismo estado)', 'DISPATCHED', 'DISPATCHED'],
  ])('%s', async (_name, from, target) => {
    const { a, b, id } = await setupOrder(from);
    const before = await observe(id, [a, b]);

    await expectTransitionRejected(id, target);

    expect(await observe(id, [a, b])).toEqual(before);
    expect(await statusOf(db, id)).toBe(from);
  });

  for (const from of ['DELIVERED', 'CANCELLED'] as const) {
    test(`ESC-21 · pedido ${from}: cada destino posible (${OPERATOR_TARGETS.join(', ')}) responde INVALID_ORDER_TRANSITION y nada cambia`, async () => {
      const { a, b, id } = await setupOrder(from);
      const before = await observe(id, [a, b]);

      for (const target of OPERATOR_TARGETS) {
        await expectTransitionRejected(id, target);
        expect(await observe(id, [a, b])).toEqual(before);
      }
      expect(await statusOf(db, id)).toBe(from);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Cancelación con restitución (F-5, D-05, CA-12)
// ---------------------------------------------------------------------------------------------

describe('TK-06.1 · ESC-22 / CA-12 (a) · cancelación con restitución', () => {
  test('ESC-22 · pedido PENDING con A × 2 y B × 1 (stock A 8, B 4): CANCELLED y stock A 10, B 5; el pedido conserva sus ítems', async () => {
    const { a, b, id, orderNumber } = await setupOrder('PENDING');
    const before = await observe(id, [a, b]);

    const result = await changeStatus(service, id, 'CANCELLED');

    expect(result).toEqual({ id, orderNumber, status: 'CANCELLED' });
    expect(await statusOf(db, id)).toBe('CANCELLED');
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 });
    const after = await observe(id, [a, b]);
    expect(after.snapshot.items).toEqual(before.snapshot.items); // un pedido cancelado conserva sus ítems (spec 04 §4.1)
    expect(after.snapshot.order.total_amount).toBe(before.snapshot.order.total_amount);
    expect(after.counts).toEqual(before.counts);
  });

  test('CA-12 (a) · pedido PROCESSING (origen permitido, RN-05): CANCELLED y cada ítem se restituye una vez', async () => {
    const { a, b, id, orderNumber } = await setupOrder('PROCESSING');

    expect(await changeStatus(service, id, 'CANCELLED')).toEqual({ id, orderNumber, status: 'CANCELLED' });

    expect(await statusOf(db, id)).toBe('CANCELLED');
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 });
  });
});

describe('TK-06.1 · ESC-24 / CA-12 (b) · cancelación desde un estado no cancelable', () => {
  test.each<OrderStatus>(['DISPATCHED', 'DELIVERED', 'CANCELLED'])(
    'ESC-24 · pedido %s: INVALID_ORDER_TRANSITION; ni el pedido ni el stock cambian',
    async (from) => {
      const { a, b, id } = await setupOrder(from);
      const before = await observe(id, [a, b]);

      await expectTransitionRejected(id, 'CANCELLED');

      expect(await observe(id, [a, b])).toEqual(before);
      expect(await stockOf(db, [a, b])).toEqual({ [a]: 8, [b]: 4 });
      expect(await statusOf(db, id)).toBe(from);
    },
  );
});

describe('TK-06.1 · ESC-25 / CA-12 (c) · cancelación repetida (secuencial)', () => {
  test('ESC-25 · PENDING cancelado dos veces seguidas: la primera cancela y restituye; la segunda INVALID_ORDER_TRANSITION; stock restituido una sola vez', async () => {
    const { a, b, id, orderNumber } = await setupOrder('PENDING');

    expect(await changeStatus(service, id, 'CANCELLED')).toEqual({ id, orderNumber, status: 'CANCELLED' });
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 });
    const afterFirst = await observe(id, [a, b]);

    await expectTransitionRejected(id, 'CANCELLED');

    expect(await observe(id, [a, b])).toEqual(afterFirst);
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 }); // no se duplicó
  });
});

describe('TK-06.1 · ESC-28 ≡ ESC-31 (spec 02) · cancelar un pedido con un producto desactivado después de confirmarse', () => {
  test('ESC-28 / ESC-31 (spec 02) · el stock del producto inactivo aumenta en la cantidad del ítem; sigue inactivo y fuera de listStockAlerts', async () => {
    const products = createProductService({ prisma: db });
    // A tendría alerta si estuviera activo (stock final ≤ mínimo): así la ausencia en alertas prueba la regla, no el azar.
    const a = await insertProduct(db, { name: 'A se desactiva', price: '100.00', currentStock: 7, minStockAlert: 50 });
    // Control: B activo con stock ≤ mínimo SÍ aparece en las alertas.
    const control = await insertProduct(db, { name: 'B control', price: '10.00', currentStock: 1, minStockAlert: 5 });
    const order = confirmedOrder(await confirm(service, { customerId, items: [{ productId: a, quantity: 3, shownUnitPrice: '100.00' }] }));
    expect(await stockOf(db, [a])).toEqual({ [a]: 4 });
    await products.deactivate(a);
    const alertsBefore = (await products.listStockAlerts()).items.map((p) => p.id);
    expect(alertsBefore).toContain(control);
    expect(alertsBefore).not.toContain(a);

    const result = await changeStatus(service, order.id, 'CANCELLED');

    expect(result).toEqual({ id: order.id, orderNumber: order.orderNumber, status: 'CANCELLED' });
    expect(await stockOf(db, [a])).toEqual({ [a]: 7 }); // 4 + 3 aunque esté inactivo
    const row = await db.product.findUniqueOrThrow({ where: { id: a } });
    expect(row.isActive).toBe(false); // sigue inactivo (RN-10: no se reactiva)
    const alertsAfter = (await products.listStockAlerts()).items.map((p) => p.id);
    expect(alertsAfter).not.toContain(a); // sigue fuera de alertas (RN-09)
    expect(alertsAfter).toContain(control);
    expect(await statusOf(db, order.id)).toBe('CANCELLED');
  });
});

describe('TK-06.1 · ESC-14 (spec 02) · cancelar y luego ajustar con expectedStock desactualizado', () => {
  test('ESC-14 (spec 02) · pedido real PENDING de 3 uds sobre stock 10 (→ 7); el operador lee 7; cancelar → 10; adjustStock con expectedStock 7 responde STOCK_CHANGED y el stock queda en 10', async () => {
    const products = createProductService({ prisma: db });
    const a = await insertProduct(db, { name: 'A ajuste', price: '100.00', currentStock: 10 });
    const order = confirmedOrder(await confirm(service, { customerId, items: [{ productId: a, quantity: 3, shownUnitPrice: '100.00' }] }));
    expect(order.status).toBe('PENDING');
    expect((await products.get(a)).currentStock).toBe(7); // lo que lee el operador

    await changeStatus(service, order.id, 'CANCELLED');
    const adjust = products.adjustStock(a, { newStock: 20, expectedStock: 7 });

    await expect(adjust).rejects.toBeInstanceOf(AppError);
    await expect(adjust).rejects.toMatchObject({ status: 409, code: 'STOCK_CHANGED' });
    expect(await stockOf(db, [a])).toEqual({ [a]: 10 });
    expect(await statusOf(db, order.id)).toBe('CANCELLED');
  });
});

describe('TK-06.1 · pedido inexistente (prueba técnica; spec 04 F-4 paso 4 y F-5 paso 2.2)', () => {
  test.each(['PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const)(
    'destino %s sobre un id inexistente: AppError 404 ORDER_NOT_FOUND y nada cambia',
    async (target) => {
      const { a, b, id } = await setupOrder('PENDING');
      const before = await observe(id, [a, b]);

      const error = await domainError(changeStatus(service, id + 999_999, target));

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ status: 404, code: 'ORDER_NOT_FOUND' });
      expect(await observe(id, [a, b])).toEqual(before);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Entrada inválida contra la base real (P3)
// ---------------------------------------------------------------------------------------------

describe('TK-06.1 · P3 · destino PENDING o fuera del enum: OrderInputError y la base no se toca', () => {
  test.each<[string, unknown]>([
    ['PENDING', 'PENDING'],
    ['SHIPPED', 'SHIPPED'],
    ['processing (minúsculas)', 'processing'],
  ])('destino %s: error de entrada, sin transacción, pedido y stock intactos', async (_name, target) => {
    const { a, b, id } = await setupOrder('PROCESSING');
    const before = await observe(id, [a, b]);
    const spy = spyOnPrisma(db);
    const spied = createOrderService({ prisma: spy.prisma });

    const error = await domainError(changeStatus(spied, id, target));

    expect(error).toMatchObject({ name: 'OrderInputError' });
    expect(error).not.toBeInstanceOf(AppError);
    expect(spy.calls).toEqual([]);
    expect(await observe(id, [a, b])).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// D-05 · orden ascendente de productId y reintentos ante P2034 en la cancelación (P4)
// ---------------------------------------------------------------------------------------------

describe('TK-06.1 · D-05 · la restitución actualiza los productos en orden ascendente de productId', () => {
  test('ítems insertados como c, a, b: las restituciones llegan a la base como a, b, c y el resultado es el esperado', async () => {
    const a = await insertProduct(db, { name: 'A', currentStock: 1000 });
    const b = await insertProduct(db, { name: 'B', currentStock: 1000 });
    const c = await insertProduct(db, { name: 'C', currentStock: 1000 });
    // Cantidades que no coinciden con ningún id (el espía identifica SQL raw por valores).
    const order = await insertOrder(db, {
      customerId,
      status: 'PROCESSING',
      items: [
        { productId: c, quantity: 700 },
        { productId: a, quantity: 500 },
        { productId: b, quantity: 600 },
      ],
    });
    const spy = spyOnPrisma(db);

    await changeStatus(createOrderService({ prisma: spy.prisma }), order.id, 'CANCELLED');

    const restituted = spy
      .txCalls()
      .filter((call) => isDeductionCall(call))
      .map((call) => deductionProductId(call, [a, b, c]));
    expect(restituted).toEqual([a, b, c]);
    expect(await stockOf(db, [a, b, c])).toEqual({ [a]: 1500, [b]: 1600, [c]: 1700 });
  });
});

/** Falla (tras ejecutar la restitución real del primer producto) los primeros `attempts` intentos con el error que fabrique `make`. */
function failFirstAttempts(attempts: number, make: () => unknown): SpyHooks {
  return { afterCall: (call, info) => (info.firstDeductionOfAttempt && call.attempt <= attempts ? make() : undefined) };
}

describe('TK-06.1 · D-05 / P4 · reintentos de la cancelación ante P2034 (1 intento + hasta 3 reintentos)', () => {
  // La regresión de P4 sobre la confirmación es tests/db/orders-confirm-retry.test.ts, que no se modifica y debe seguir verde.
  async function cancelWith(hooks: SpyHooks, status: OrderStatus = 'PENDING') {
    const { a, b, id, orderNumber } = await setupOrder(status);
    const spy = spyOnPrisma(db, hooks);
    const spied = createOrderService({ prisma: spy.prisma });
    return { a, b, id, orderNumber, spy, spied };
  }

  test('P2034 en el primer intento, tras restituir el primer producto: 2 intentos, éxito, restitución una sola vez (A 10, B 5)', async () => {
    const { a, b, id, orderNumber, spy, spied } = await cancelWith(failFirstAttempts(1, prismaP2034));

    expect(await changeStatus(spied, id, 'CANCELLED')).toEqual({ id, orderNumber, status: 'CANCELLED' });

    expect(spy.attempts()).toBe(2);
    expect(spy.events).toEqual(['tx-start:1', 'tx-rejected:1', 'tx-start:2', 'tx-resolved:2']);
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 }); // la restitución del intento fallido se revirtió
    expect(await statusOf(db, id)).toBe('CANCELLED');
  });

  test('tres P2034 seguidos y éxito en el cuarto intento: restitución una sola vez y pedido CANCELLED', async () => {
    const { a, b, id, orderNumber, spy, spied } = await cancelWith(failFirstAttempts(3, prismaP2034), 'PROCESSING');

    expect(await changeStatus(spied, id, 'CANCELLED')).toEqual({ id, orderNumber, status: 'CANCELLED' });

    expect(spy.attempts()).toBe(4);
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 });
    expect(await statusOf(db, id)).toBe('CANCELLED');
  });

  test('cuatro P2034 consecutivos: se propaga el error P2034 tras exactamente 4 intentos; pedido y stock intactos', async () => {
    const { a, b, id, spy, spied } = await cancelWith(failFirstAttempts(4, prismaP2034));
    const before = await observe(id, [a, b]);

    await expect(changeStatus(spied, id, 'CANCELLED')).rejects.toMatchObject({ code: 'P2034' });

    expect(spy.attempts()).toBe(4);
    expect(await observe(id, [a, b])).toEqual(before);
    expect(await statusOf(db, id)).toBe('PENDING');
  });

  test.each<[string, () => unknown]>([
    ['un Error genérico', () => new Error('fallo inesperado')],
    ['un error conocido de Prisma que no es P2034 (P2002)', () => prismaKnownError('P2002')],
  ])('%s no se reintenta: un solo intento, el error se propaga y no queda nada cambiado', async (_name, make) => {
    const { a, b, id, spy, spied } = await cancelWith(failFirstAttempts(4, make));
    const before = await observe(id, [a, b]);

    await expect(changeStatus(spied, id, 'CANCELLED')).rejects.toBeInstanceOf(Error);

    expect(spy.attempts()).toBe(1);
    expect(await observe(id, [a, b])).toEqual(before);
  });
});
