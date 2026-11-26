import type { Client } from 'pg';
import { createOrderService } from '../../src/modules/orders/orders.service';
import { deductionProductId, isDeductionCall, isProductRead, spyOnPrisma, type SpyHooks } from '../helpers/prisma-spy';
import {
  confirm,
  confirmedOrder,
  insertCustomer,
  orderCounts,
  persistedOrders,
  priceOf,
  sortedRejections,
  stockOf,
} from './helpers/orders';
import { connectTestPrisma, insertProduct, waitForLockWaiters, type Db } from './helpers/products';
import { connectTestDatabase } from './helpers/test-database';

// Pruebas de aceptación de TK-05.3 · orden de los bloqueos y validación con datos vigentes bajo el bloqueo de la fila
// (spec 04 F-1 pasos 3 y 4, §10.1, ESC-11; ARCHITECTURE "flujo de confirmación" y "Prevención de interbloqueos";
// RN-01, RN-02, RN-03, RNF-04 para ESC-11). Nivel I/C contra medsupply_test con un espía sobre Prisma real
// (tests/helpers/prisma-spy.ts) y escritores concurrentes en conexiones propias (pg). Matriz: docs/qa/TK-05.3-matrix.md.
//
// Condición A: el servicio debe evaluar estado activo, stock y precio con los datos vigentes al obtener el bloqueo de la
// fila. Se prueba (1) con el orden real de las sentencias y (2) con cambios concurrentes confirmados mientras la
// confirmación está pausada justo antes del descuento (la fila aún no está bloqueada) o justo después (ya bloqueada).
//
// Cómo se reconoce el descuento: `product.updateMany`/`product.update` con `currentStock` en los datos, o un UPDATE
// raw de products (isDeductionCall). Las pruebas pausan al servicio dentro de la transacción mediante el espía.

let db: Db;
let customerId: number;
let writer: Client;
let observer: Client;

beforeAll(async () => {
  db = await connectTestPrisma();
});

afterAll(async () => {
  await db?.$disconnect();
});

beforeEach(async () => {
  customerId = await insertCustomer(db);
  writer = await connectTestDatabase();
  observer = await connectTestDatabase();
});

afterEach(async () => {
  await writer?.end().catch(() => undefined);
  await observer?.end().catch(() => undefined);
});

function spied(hooks: SpyHooks = {}) {
  const spy = spyOnPrisma(db, hooks);
  return { spy, service: createOrderService({ prisma: spy.prisma }) };
}

async function insertWithId(id: number, data: { price: string; currentStock: number; isActive?: boolean }): Promise<number> {
  const row = await db.product.create({
    data: { id, name: `Producto ${id}`, price: data.price, currentStock: data.currentStock, minStockAlert: 3, isActive: data.isActive ?? true },
  });
  return row.id;
}

describe('TK-05.3 · condición A · orden ascendente de productId y precio leído tras el descuento', () => {
  test('orden · entrada desordenada 7, 2, 5: los descuentos se ejecutan en orden ascendente 2, 5, 7, en una sola transacción', async () => {
    const ids = [await insertWithId(2, { price: '10.00', currentStock: 5000 }), await insertWithId(5, { price: '20.00', currentStock: 5000 }), await insertWithId(7, { price: '30.00', currentStock: 5000 })];
    const { spy, service } = spied();

    const result = await confirm(service, {
      customerId,
      items: [
        { productId: 7, quantity: 1003, shownUnitPrice: '30.00' },
        { productId: 2, quantity: 1001, shownUnitPrice: '10.00' },
        { productId: 5, quantity: 1002, shownUnitPrice: '20.00' },
      ],
    });

    expect(result.ok).toBe(true);
    const deducted = spy.txCalls().filter(isDeductionCall).map((c) => deductionProductId(c, ids));
    expect(deducted).toEqual([2, 5, 7]);
    expect(spy.attempts()).toBe(1);
    expect(await stockOf(db, ids)).toEqual({ 2: 3999, 5: 3998, 7: 3997 });
  });

  test('orden · F-1 paso 3 "sigue con el resto": con el primer ítem rechazado (producto 2 inactivo) se intenta igualmente el descuento de 2, 5 y 7 en orden ascendente, y no queda nada persistido', async () => {
    const ids = [await insertWithId(2, { price: '10.00', currentStock: 5000, isActive: false }), await insertWithId(5, { price: '20.00', currentStock: 5000 }), await insertWithId(7, { price: '30.00', currentStock: 5000 })];
    const before = await stockOf(db, ids);
    const { spy, service } = spied();

    const result = await confirm(service, {
      customerId,
      items: [
        { productId: 7, quantity: 1003, shownUnitPrice: '30.00' },
        { productId: 2, quantity: 1001, shownUnitPrice: '10.00' },
        { productId: 5, quantity: 1002, shownUnitPrice: '20.00' },
      ],
    });

    expect(sortedRejections(result)).toEqual([{ productId: 2, reason: 'PRODUCT_INACTIVE' }]);
    expect(spy.txCalls().filter(isDeductionCall).map((c) => deductionProductId(c, ids))).toEqual([2, 5, 7]);
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, ids)).toEqual(before);
  });

  test('descuento condicional · antes del primer descuento no hay lecturas de products dentro de la transacción (el precio se lee después, sobre la fila ya bloqueada)', async () => {
    const a = await insertProduct(db, { price: '100.00', currentStock: 10 });
    const b = await insertProduct(db, { price: '50.00', currentStock: 10 });
    const { spy, service } = spied();

    confirmedOrder(
      await confirm(service, {
        customerId,
        items: [
          { productId: b, quantity: 1, shownUnitPrice: '50.00' },
          { productId: a, quantity: 1, shownUnitPrice: '100.00' },
        ],
      }),
    );

    const inTransaction = spy.txCalls();
    const firstDeduction = inTransaction.findIndex(isDeductionCall);
    expect(firstDeduction).toBeGreaterThanOrEqual(0);
    expect(inTransaction.slice(0, firstDeduction).filter(isProductRead)).toEqual([]);
    expect(spy.calls.filter((c) => c.where === 'prisma')).toEqual([]);
  });
});

describe('TK-05.3 · ESC-11 / condición A · cambio concurrente real contra PostgreSQL', () => {
  /** Confirma una sola fila de A y ejecuta `action` (sobre una conexión propia) justo antes del descuento. */
  async function confirmWithChangeBeforeLock(sql: string, initial: { price: string; currentStock: number }, quantity: number, shownUnitPrice = '100.00') {
    const a = await insertProduct(db, { name: 'A', price: initial.price, currentStock: initial.currentStock });
    let fired = 0;
    const { spy, service } = spied({
      async beforeDeduction() {
        fired += 1;
        await writer.query(sql, [a]); // se confirma (autocommit) antes de que la transacción bloquee la fila
      },
    });
    const result = await confirm(service, { customerId, items: [{ productId: a, quantity, shownUnitPrice }] });
    expect(fired).toBe(1); // el descuento se reconoció y la pausa ocurrió
    return { a, result, spy };
  }

  test('ESC-11 · el precio cambia (y se confirma) justo antes de que la transacción bloquee la fila: se compara con el precio vigente, PRICE_CHANGED 120.00 y nada persistido', async () => {
    const { a, result } = await confirmWithChangeBeforeLock("UPDATE products SET price = '120.00' WHERE id = $1", { price: '100.00', currentStock: 10 }, 1);

    expect(sortedRejections(result)).toEqual([{ productId: a, reason: 'PRICE_CHANGED', currentUnitPrice: '120.00' }]);
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 10 });
  }, 20000);

  test('condición A · el producto se desactiva justo antes del bloqueo: PRODUCT_INACTIVE con el estado vigente; nada persistido', async () => {
    const { a, result } = await confirmWithChangeBeforeLock('UPDATE products SET is_active = false WHERE id = $1', { price: '100.00', currentStock: 10 }, 1);

    expect(sortedRejections(result)).toEqual([{ productId: a, reason: 'PRODUCT_INACTIVE' }]);
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 10 });
  }, 20000);

  test('condición A · el stock baja a 1 justo antes del bloqueo: STOCK_INSUFFICIENT con disponible 1 (valor vigente, no el leído antes); nada persistido', async () => {
    const { a, result } = await confirmWithChangeBeforeLock('UPDATE products SET current_stock = 1 WHERE id = $1', { price: '100.00', currentStock: 10 }, 2);

    expect(sortedRejections(result)).toEqual([{ productId: a, reason: 'STOCK_INSUFFICIENT', availableStock: 1 }]);
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a])).toEqual({ [a]: 1 });
  }, 20000);

  test('condición A · el stock baja de 10 a 5 justo antes del bloqueo y se piden 2: el descuento es atómico sobre el valor vigente (queda 3, sin actualización perdida)', async () => {
    const { a, result } = await confirmWithChangeBeforeLock('UPDATE products SET current_stock = 5 WHERE id = $1', { price: '100.00', currentStock: 10 }, 2);

    confirmedOrder(result);
    expect(await stockOf(db, [a])).toEqual({ [a]: 3 });
    expect(await orderCounts(db)).toEqual({ orders: 1, items: 1 });
  }, 20000);

  test('ESC-11 · con la fila ya bloqueada por la confirmación, un cambio de precio concurrente espera al commit: el pedido guarda el precio mostrado (100.00) y el cambio se aplica después (120.00)', async () => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 10 });
    let priceChange: Promise<unknown> | undefined;
    let changeFinished = false;
    let finishedWhileLocked: boolean | undefined;
    let blocked = false;
    let priceWhileBlocked: string | undefined;
    const { service } = spied({
      async afterDeduction() {
        priceChange = writer.query("UPDATE products SET price = '120.00' WHERE id = $1", [a]).then((r) => {
          changeFinished = true;
          return r;
        });
        blocked = await waitForLockWaiters(observer, 1);
        const { rows } = await observer.query<{ price: string }>('SELECT price::text AS price FROM products WHERE id = $1', [a]);
        priceWhileBlocked = rows[0].price;
        finishedWhileLocked = changeFinished; // se observa mientras la confirmación aún no ha hecho COMMIT
      },
    });

    const result = await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] });
    await priceChange;

    expect(blocked).toBe(true); // el cambio de precio quedó esperando el bloqueo de fila
    expect(finishedWhileLocked).toBe(false);
    expect(priceWhileBlocked).toBe('100.00');
    const order = confirmedOrder(result);
    expect(order.items).toEqual([{ productId: a, quantity: 1, unitPrice: '100.00' }]);
    expect((await persistedOrders(db))[0].items).toEqual([{ product_id: a, quantity: 1, unit_price: '100.00' }]);
    expect(await priceOf(db, a)).toBe('120.00');
  }, 20000);
});
