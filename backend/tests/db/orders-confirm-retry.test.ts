import { createOrderService } from '../../src/modules/orders/orders.service';
import { prismaKnownError, prismaP2034, safeJson, spyOnPrisma, type SpyHooks } from '../helpers/prisma-spy';
import { confirm, confirmedOrder, insertCustomer, orderCounts, persistedOrders, stockOf } from './helpers/orders';
import { connectTestPrisma, insertProduct, type Db } from './helpers/products';

// Pruebas de aceptación de TK-05.3 · reintentos ante P2034, aislamiento y resultado preparado dentro de la transacción
// (spec 04 ESC-12, ESC-15, D-04, D-05; ARCHITECTURE "Prevención de interbloqueos"; RNF-03, RNF-04). Nivel I contra
// medsupply_test con un espía sobre Prisma real (tests/helpers/prisma-spy.ts): el espía ejecuta cada llamada de verdad y
// el P2034 simulado se lanza tras el primer descuento real de cada intento, de modo que hay trabajo parcial que el
// servicio debe revertir y repetir entero. Máximo 4 intentos (1 + 3 reintentos). Matriz: docs/qa/TK-05.3-matrix.md.

let db: Db;
let customerId: number;

beforeAll(async () => {
  db = await connectTestPrisma();
});

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  customerId = await insertCustomer(db);
});

function spied(hooks: SpyHooks = {}) {
  const spy = spyOnPrisma(db, hooks);
  return { spy, service: createOrderService({ prisma: spy.prisma }) };
}

/** Falla (tras ejecutar el descuento real) los primeros `attempts` intentos con el error que fabrique `make`. */
function failFirstAttempts(attempts: number, make: () => unknown): SpyHooks {
  return { afterCall: (call, info) => (info.firstDeductionOfAttempt && call.attempt <= attempts ? make() : undefined) };
}

async function setup() {
  const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 10 });
  const b = await insertProduct(db, { name: 'B', price: '50.00', currentStock: 5 });
  const input = {
    customerId,
    items: [
      { productId: a, quantity: 2, shownUnitPrice: '100.00' },
      { productId: b, quantity: 1, shownUnitPrice: '50.00' },
    ],
  };
  return { a, b, input };
}

describe('TK-05.3 · ESC-12 / condición B · reintentos ante P2034 (máximo 4 intentos)', () => {
  test('ESC-12 (a) · P2034 en el primer intento y éxito en el segundo: exactamente un pedido, stock descontado una sola vez, 2 intentos', async () => {
    const { a, b, input } = await setup();
    const { spy, service } = spied(failFirstAttempts(1, prismaP2034));

    const order = confirmedOrder(await confirm(service, input));

    expect(spy.attempts()).toBe(2);
    expect(spy.events).toEqual(['tx-start:1', 'tx-rejected:1', 'tx-start:2', 'tx-resolved:2']);
    expect(await orderCounts(db)).toEqual({ orders: 1, items: 2 });
    expect((await persistedOrders(db))[0].id).toBe(order.id);
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 8, [b]: 4 }); // el descuento del intento fallido se revirtió
  });

  test('ESC-12 · tres P2034 seguidos y éxito en el cuarto intento (1 + 3 reintentos): un solo pedido y stock descontado una vez', async () => {
    const { a, b, input } = await setup();
    const { spy, service } = spied(failFirstAttempts(3, prismaP2034));

    confirmedOrder(await confirm(service, input));

    expect(spy.attempts()).toBe(4);
    expect(await orderCounts(db)).toEqual({ orders: 1, items: 2 });
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 8, [b]: 4 });
  });

  test('ESC-12 (b) · cuatro P2034 consecutivos: el servicio propaga el error P2034 tras exactamente 4 intentos y no persiste nada', async () => {
    const { a, b, input } = await setup();
    const { spy, service } = spied(failFirstAttempts(4, prismaP2034));

    await expect(confirm(service, input)).rejects.toMatchObject({ code: 'P2034' });

    expect(spy.attempts()).toBe(4);
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 });
  });

  test.each<[string, () => unknown]>([
    ['un Error genérico', () => new Error('fallo inesperado')],
    ['un error conocido de Prisma que no es P2034 (P2002)', () => prismaKnownError('P2002')],
    ['un error conocido de Prisma que no es P2034 (P2025)', () => prismaKnownError('P2025')],
  ])('condición B (c) · %s no se reintenta: un solo intento, el error se propaga y no se persiste nada', async (_name, make) => {
    const { a, b, input } = await setup();
    const { spy, service } = spied(failFirstAttempts(4, make));

    await expect(confirm(service, input)).rejects.toBeInstanceOf(Error);

    expect(spy.attempts()).toBe(1);
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 10, [b]: 5 });
  });

  test('condición B · un P2034 seguido de un rechazo de negocio no crea pedido: el reintento revalida y el rechazo se devuelve como resultado', async () => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 1 });
    const { spy, service } = spied(failFirstAttempts(1, prismaP2034));

    const result = await confirm(service, { customerId, items: [{ productId: a, quantity: 2, shownUnitPrice: '100.00' }] });

    expect(result).toEqual({ ok: false, rejections: [{ productId: a, reason: 'STOCK_INSUFFICIENT', availableStock: 1 }] });
    expect(spy.attempts()).toBe(2);
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 1 });
  });
});

describe('TK-05.3 · aislamiento READ COMMITTED (spec 04 F-1 paso 2)', () => {
  test('cada intento abre la transacción interactiva con aislamiento ReadCommitted', async () => {
    const { input } = await setup();
    const { spy, service } = spied(failFirstAttempts(1, prismaP2034));

    confirmedOrder(await confirm(service, input));

    expect(spy.transactionOptions).toHaveLength(2);
    for (const options of spy.transactionOptions) expect(options).toMatchObject({ isolationLevel: 'ReadCommitted' });
  });
});

describe('TK-05.3 · ESC-15 · D-04 · el resultado se prepara dentro de la transacción; tras el COMMIT no hay llamadas', () => {
  test('ESC-15 · una sola transacción; ninguna llamada al cliente fuera de ella; número, total e ítems provienen de la transacción y no hay accesos tras resolverse', async () => {
    const { a, b, input } = await setup();
    const { spy, service } = spied();

    const order = confirmedOrder(await confirm(service, input));
    const callsAtReturn = spy.calls.length;
    await new Promise((resolve) => setImmediate(resolve)); // deja pasar cualquier trabajo diferido tras la devolución

    expect(spy.events).toEqual(['tx-start:1', 'tx-resolved:1']);
    expect(spy.calls.filter((c) => c.where === 'prisma')).toEqual([]); // nada fuera de la transacción, ni antes ni después
    expect(spy.calls.every((c) => c.where === 'tx' && c.phase === 'in-tx')).toBe(true);
    expect(spy.calls.length).toBe(callsAtReturn); // sin accesos posteriores a la devolución
    // El número se obtiene en el propio INSERT dentro de la transacción: aparece en el resultado de una llamada de la transacción.
    expect(spy.txCalls().some((c) => safeJson(c.result).includes(order.orderNumber))).toBe(true);
    // Lo devuelto coincide con lo que quedó confirmado.
    expect(await persistedOrders(db)).toEqual([
      {
        id: order.id,
        order_number: order.orderNumber,
        customer_id: customerId,
        status: 'PENDING',
        total_amount: order.totalAmount,
        items: [
          { product_id: a, quantity: 2, unit_price: '100.00' },
          { product_id: b, quantity: 1, unit_price: '50.00' },
        ],
      },
    ]);
  });

  test('ESC-15 · con rechazo de negocio tampoco hay llamadas fuera de la transacción ni posteriores a su cierre', async () => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 1 });
    const { spy, service } = spied();

    const result = await confirm(service, { customerId, items: [{ productId: a, quantity: 2, shownUnitPrice: '100.00' }] });
    await new Promise((resolve) => setImmediate(resolve));

    expect(result.ok).toBe(false);
    expect(spy.attempts()).toBe(1);
    expect(spy.calls.every((c) => c.where === 'tx' && c.phase === 'in-tx')).toBe(true);
  });
});
