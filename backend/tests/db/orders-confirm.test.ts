import { AppError } from '../../src/lib/app-error';
import { createOrderService } from '../../src/modules/orders/orders.service';
import { createProductService } from '../../src/modules/products/products.service';
import { spyOnPrisma } from '../helpers/prisma-spy';
import {
  confirm,
  confirmedOrder,
  exactTotal,
  insertCustomer,
  MONEY_FORMAT,
  ORDER_NUMBER_FORMAT,
  orderCounts,
  persistedOrders,
  priceOf,
  sortedRejections,
  stockOf,
} from './helpers/orders';
import { connectTestPrisma, insertProduct, type Db } from './helpers/products';

// Pruebas de aceptación de TK-05.3 · confirmación atómica del pedido: resultado y rechazos (spec 04 F-1, D-01..D-03,
// ESC-01, ESC-04..ESC-08, ESC-13; spec 02 ESC-13, ESC-18, ESC-23; CA-03, CA-14, CA-15, CA-05 secuencial; RN-01..RN-03,
// RNF-03). Nivel I contra medsupply_test (`npm run test:db`); cada test crea sus propios clientes y productos.
// Los escenarios de transacción, bloqueo, reintentos y secuencia están en orders-confirm-lock/-retry/-sequence.
// Matriz: docs/qa/TK-05.3-matrix.md.

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

/** Nada persistido: ni pedidos ni ítems, y el stock de TODOS los productos es el inicial. */
async function expectNothingPersisted(initialStock: Record<number, number>): Promise<void> {
  expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
  expect(await stockOf(db, Object.keys(initialStock).map(Number))).toEqual(initialStock);
}

describe('TK-05.3 · ESC-01 / CA-03 / RN-02 / RN-03 / RN-04 · confirmación válida', () => {
  test('ESC-01 · A×2 y B×1 con los precios mostrados: pedido PENDING con número MED-, ítems con precio congelado, total 250.00 y stock 8/4', async () => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 10 });
    const b = await insertProduct(db, { name: 'B', price: '50.00', currentStock: 5 });

    const result = await confirm(service, {
      customerId,
      items: [
        { productId: a, quantity: 2, shownUnitPrice: '100.00' },
        { productId: b, quantity: 1, shownUnitPrice: '50.00' },
      ],
    });

    const order = confirmedOrder(result);
    expect(order.status).toBe('PENDING');
    expect(order.orderNumber).toMatch(ORDER_NUMBER_FORMAT);
    expect(order.totalAmount).toBe('250.00');
    expect([...order.items].sort((x, y) => x.productId - y.productId)).toEqual([
      { productId: a, quantity: 2, unitPrice: '100.00' },
      { productId: b, quantity: 1, unitPrice: '50.00' },
    ]);
    expect(Object.keys(order).sort()).toEqual(['id', 'items', 'orderNumber', 'status', 'totalAmount']);
    expect(await stockOf(db, [a, b])).toEqual({ [a]: 8, [b]: 4 });
    // Lo devuelto coincide con lo persistido.
    expect(await persistedOrders(db)).toEqual([
      {
        id: order.id,
        order_number: order.orderNumber,
        customer_id: customerId,
        status: 'PENDING',
        total_amount: '250.00',
        items: [
          { product_id: a, quantity: 2, unit_price: '100.00' },
          { product_id: b, quantity: 1, unit_price: '50.00' },
        ],
      },
    ]);
  });

  test('RN-03 · los cambios posteriores de precio no afectan al pedido ya confirmado', async () => {
    const a = await insertProduct(db, { price: '100.00', currentStock: 10 });
    const order = confirmedOrder(await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] }));

    await db.product.update({ where: { id: a }, data: { price: '999.00' } });

    const [persisted] = await persistedOrders(db);
    expect(persisted.id).toBe(order.id);
    expect(persisted.items).toEqual([{ product_id: a, quantity: 1, unit_price: '100.00' }]);
    expect(persisted.total_amount).toBe('100.00');
  });

  test('importes · shownUnitPrice, unitPrice y totalAmount son cadenas de dos decimales; el total es exacto (sin punto flotante) y coincide con la base', async () => {
    const a = await insertProduct(db, { name: 'Caro', price: '1234567.89', currentStock: 10 });
    const b = await insertProduct(db, { name: 'Barato', price: '0.07', currentStock: 10 });
    const c = await insertProduct(db, { name: 'Centavos', price: '19.99', currentStock: 100 });

    const order = confirmedOrder(
      await confirm(service, {
        customerId,
        items: [
          { productId: a, quantity: 3, shownUnitPrice: '1234567.89' },
          { productId: b, quantity: 3, shownUnitPrice: '0.07' },
          { productId: c, quantity: 33, shownUnitPrice: '19.99' },
        ],
      }),
    );

    expect(typeof order.totalAmount).toBe('string');
    expect(order.totalAmount).toMatch(MONEY_FORMAT);
    for (const item of order.items) {
      expect(typeof item.unitPrice).toBe('string');
      expect(item.unitPrice).toMatch(MONEY_FORMAT);
    }
    // 3 × 1234567.89 + 3 × 0.07 + 33 × 19.99 = 3703703.67 + 0.21 + 659.67
    expect(order.totalAmount).toBe('3704363.55');
    expect(order.totalAmount).toBe(exactTotal(order.items));
    expect((await persistedOrders(db))[0].total_amount).toBe('3704363.55');
  });
});

describe('TK-05.3 · ESC-04 / ESC-05 / ESC-06 · rechazos: lista de ítems afectados y nada persistido (RNF-03, CA-14, CA-15)', () => {
  test('ESC-04 · A con stock 1 y cantidad 2, junto a B válido: STOCK_INSUFFICIENT con stock disponible 1; sin pedido ni ítems; stock de A y B sin cambios', async () => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 1 });
    const b = await insertProduct(db, { name: 'B', price: '50.00', currentStock: 5 });
    const before = await stockOf(db, [a, b]);

    const result = await confirm(service, {
      customerId,
      items: [
        { productId: a, quantity: 2, shownUnitPrice: '100.00' },
        { productId: b, quantity: 1, shownUnitPrice: '50.00' },
      ],
    });

    expect(sortedRejections(result)).toEqual([{ productId: a, reason: 'STOCK_INSUFFICIENT', availableStock: 1 }]);
    await expectNothingPersisted(before);
  });

  test('ESC-05 · CA-14 · B desactivado después de agregarse al carrito: PRODUCT_INACTIVE; sin pedido; stock de A y B sin cambios', async () => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 10 });
    const b = await insertProduct(db, { name: 'B', price: '50.00', currentStock: 5 });
    await db.product.update({ where: { id: b }, data: { isActive: false } });
    const before = await stockOf(db, [a, b]);

    const result = await confirm(service, {
      customerId,
      items: [
        { productId: a, quantity: 2, shownUnitPrice: '100.00' },
        { productId: b, quantity: 1, shownUnitPrice: '50.00' },
      ],
    });

    expect(sortedRejections(result)).toEqual([{ productId: b, reason: 'PRODUCT_INACTIVE' }]);
    await expectNothingPersisted(before);
  });

  test('ESC-06 · CA-15 · precio mostrado 100.00 y vigente 120.00: PRICE_CHANGED con el precio vigente; sin pedido; stock sin cambios', async () => {
    const a = await insertProduct(db, { name: 'A', price: '120.00', currentStock: 10 });
    const before = await stockOf(db, [a]);

    const result = await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] });

    expect(sortedRejections(result)).toEqual([{ productId: a, reason: 'PRICE_CHANGED', currentUnitPrice: '120.00' }]);
    await expectNothingPersisted(before);
  });

  test('ESC-06 · CA-15 · tras PRICE_CHANGED, reconfirmar con el precio vigente crea el pedido con ese precio', async () => {
    const a = await insertProduct(db, { name: 'A', price: '120.00', currentStock: 10 });
    expect((await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] })).ok).toBe(false);

    const order = confirmedOrder(await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '120.00' }] }));

    expect(order.items).toEqual([{ productId: a, quantity: 1, unitPrice: '120.00' }]);
    expect(order.totalAmount).toBe('120.00');
    expect(await stockOf(db, [a])).toEqual({ [a]: 9 });
  });
});

describe('TK-05.3 · ESC-07 / ESC-08 · varios motivos y precedencia por ítem (D-01, D-02)', () => {
  test('ESC-07 · A inactivo, B sin stock suficiente, C con precio cambiado y D válido: tres rechazos con su dato; D no aparece; nada persistido', async () => {
    const a = await insertProduct(db, { name: 'A', price: '10.00', currentStock: 10, isActive: false });
    const b = await insertProduct(db, { name: 'B', price: '20.00', currentStock: 1 });
    const c = await insertProduct(db, { name: 'C', price: '35.50', currentStock: 10 });
    const d = await insertProduct(db, { name: 'D', price: '40.00', currentStock: 10 });
    const before = await stockOf(db, [a, b, c, d]);

    const result = await confirm(service, {
      customerId,
      items: [
        { productId: a, quantity: 1, shownUnitPrice: '10.00' },
        { productId: b, quantity: 3, shownUnitPrice: '20.00' },
        { productId: c, quantity: 1, shownUnitPrice: '30.00' },
        { productId: d, quantity: 2, shownUnitPrice: '40.00' },
      ],
    });

    expect(sortedRejections(result)).toEqual([
      { productId: a, reason: 'PRODUCT_INACTIVE' },
      { productId: b, reason: 'STOCK_INSUFFICIENT', availableStock: 1 },
      { productId: c, reason: 'PRICE_CHANGED', currentUnitPrice: '35.50' },
    ]);
    await expectNothingPersisted(before);
  });

  test('ESC-08 · D-02 · A inactivo y con stock menor que lo pedido: un solo motivo, PRODUCT_INACTIVE, sin stock disponible', async () => {
    const a = await insertProduct(db, { name: 'A', price: '10.00', currentStock: 1, isActive: false });
    const before = await stockOf(db, [a]);

    const result = await confirm(service, { customerId, items: [{ productId: a, quantity: 5, shownUnitPrice: '10.00' }] });

    const rejections = sortedRejections(result);
    expect(rejections).toEqual([{ productId: a, reason: 'PRODUCT_INACTIVE' }]);
    expect(rejections[0]).not.toHaveProperty('availableStock');
    await expectNothingPersisted(before);
  });

  test('D-02 · PRICE_CHANGED solo se evalúa en los ítems descontados: un ítem sin stock con precio también cambiado informa solo STOCK_INSUFFICIENT', async () => {
    const a = await insertProduct(db, { name: 'A', price: '90.00', currentStock: 1 });
    const before = await stockOf(db, [a]);

    const result = await confirm(service, { customerId, items: [{ productId: a, quantity: 2, shownUnitPrice: '100.00' }] });

    expect(sortedRejections(result)).toEqual([{ productId: a, reason: 'STOCK_INSUFFICIENT', availableStock: 1 }]);
    await expectNothingPersisted(before);
  });

  test('RN-01 · el stock disponible informado es el vigente en la transacción, también con stock 0', async () => {
    const a = await insertProduct(db, { name: 'A', price: '10.00', currentStock: 0 });
    const before = await stockOf(db, [a]);

    const result = await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '10.00' }] });

    expect(sortedRejections(result)).toEqual([{ productId: a, reason: 'STOCK_INSUFFICIENT', availableStock: 0 }]);
    await expectNothingPersisted(before);
  });
});

describe('TK-05.3 · CA-05 (secuencial) · las últimas unidades: gana el primero en confirmar (RN-01, RN-02)', () => {
  test('CA-05 · A con stock 1 y dos clientes que confirman uno tras otro: un pedido, el segundo STOCK_INSUFFICIENT con disponible 0 y stock final 0 (el paralelo es TK-05.5)', async () => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 1 });
    const second = await insertCustomer(db);

    const first = await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] });
    const late = await confirm(service, { customerId: second, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] });

    expect(first.ok).toBe(true);
    expect(sortedRejections(late)).toEqual([{ productId: a, reason: 'STOCK_INSUFFICIENT', availableStock: 0 }]);
    expect(await stockOf(db, [a])).toEqual({ [a]: 0 });
    const orders = await persistedOrders(db);
    expect(orders).toHaveLength(1);
    expect(orders[0].customer_id).toBe(customerId);
  });
});

describe('TK-05.3 · heredados de la spec 02 (con pedido confirmado real)', () => {
  test('ESC-13 (spec 02) · se confirma un pedido de 3 y luego el operador ajusta con expectedStock 10: STOCK_CHANGED y el stock queda en 7', async () => {
    const a = await insertProduct(db, { price: '100.00', currentStock: 10 });
    confirmedOrder(await confirm(service, { customerId, items: [{ productId: a, quantity: 3, shownUnitPrice: '100.00' }] }));
    const products = createProductService({ prisma: db });

    const adjust = products.adjustStock(a, { newStock: 20, expectedStock: 10 });

    await expect(adjust).rejects.toBeInstanceOf(AppError);
    await expect(adjust).rejects.toMatchObject({ status: 409, code: 'STOCK_CHANGED' });
    expect(await stockOf(db, [a])).toEqual({ [a]: 7 });
  });

  test('ESC-18 (spec 02) · el operador ajusta de 10 a 2 con 4 unidades en el carrito: el pedido de 4 se rechaza con STOCK_INSUFFICIENT (disponible 2) y el stock sigue en 2', async () => {
    const a = await insertProduct(db, { price: '100.00', currentStock: 10 });
    await createProductService({ prisma: db }).adjustStock(a, { newStock: 2, expectedStock: 10 });

    const result = await confirm(service, { customerId, items: [{ productId: a, quantity: 4, shownUnitPrice: '100.00' }] });

    expect(sortedRejections(result)).toEqual([{ productId: a, reason: 'STOCK_INSUFFICIENT', availableStock: 2 }]);
    await expectNothingPersisted({ [a]: 2 });
  });

  test('ESC-23 (spec 02) · producto con stock 6 y mínimo 5: tras confirmar 1 unidad aparece en listStockAlerts', async () => {
    const a = await insertProduct(db, { name: 'Con alerta', price: '100.00', currentStock: 6, minStockAlert: 5 });
    const products = createProductService({ prisma: db });
    expect((await products.listStockAlerts()).items.map((p) => p.id)).not.toContain(a);

    confirmedOrder(await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] }));

    const alerts = await products.listStockAlerts();
    expect(alerts.items.map((p) => p.id)).toContain(a);
    expect(alerts.items.find((p) => p.id === a)?.currentStock).toBe(5);
  });
});

describe('TK-05.3 · ESC-13 (spec 04) · entrada inválida contra la base real: error, ninguna transacción y nada persistido', () => {
  const valid = (productId: number) => ({ productId, quantity: 2, shownUnitPrice: '100.00' });

  test.each([
    ['lista vacía', () => []],
    ['cantidad 0', (id: number) => [{ ...valid(id), quantity: 0 }]],
    ['cantidad negativa', (id: number) => [{ ...valid(id), quantity: -3 }]],
    ['el mismo producto dos veces', (id: number) => [valid(id), { ...valid(id), quantity: 1 }]],
  ])('ESC-13 · %s: lanza error, el espía confirma que no se abrió transacción ni hubo consultas, y el stock y los pedidos no cambian', async (_name, buildItems) => {
    const a = await insertProduct(db, { price: '100.00', currentStock: 10 });
    const spy = spyOnPrisma(db);
    const spied = createOrderService({ prisma: spy.prisma });

    await expect((async () => spied.confirmOrder({ customerId, items: buildItems(a) }))()).rejects.toBeInstanceOf(Error);

    expect(spy.attempts()).toBe(0);
    expect(spy.calls).toEqual([]);
    await expectNothingPersisted({ [a]: 10 });
    expect(await priceOf(db, a)).toBe('100.00');
  });
});

describe('TK-05.3 · ESC-37 (spec 04 v1.1) · D5 · producto inexistente: se detecta dentro de la transacción, ROLLBACK y error (no es un rechazo)', () => {
  const GHOST_HIGH = 999999;

  async function withProduct(id: number) {
    const row = await db.product.create({ data: { id, name: `Producto ${id}`, price: '100.00', currentStock: 10, minStockAlert: 3 } });
    return row.id;
  }

  test('ESC-37 · un productId inexistente solo: lanza error tras abrir la transacción (sin consulta previa fuera de ella), se revierte y no hay pedido ni ítems', async () => {
    const spy = spyOnPrisma(db);
    const spied = createOrderService({ prisma: spy.prisma });

    await expect((async () => spied.confirmOrder({ customerId, items: [{ productId: GHOST_HIGH, quantity: 1, shownUnitPrice: '100.00' }] }))()).rejects.toBeInstanceOf(Error);

    expect(spy.attempts()).toBe(1); // se abrió la transacción y el error no se reintenta
    expect(spy.events).toEqual(['tx-start:1', 'tx-rejected:1']); // ROLLBACK: la transacción terminó con error
    expect(spy.calls.filter((c) => c.where === 'prisma')).toEqual([]); // ninguna consulta previa fuera de la transacción
    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
  });

  test.each<[string, number, number]>([
    ['el inexistente se procesa después del válido (id mayor): el descuento del válido se revierte', 1, GHOST_HIGH],
    ['el inexistente se procesa antes del válido (id menor): no se descuenta nada', 50, 7],
  ])('ESC-37 · combinado con un ítem válido de otro producto, %s: lanza error; sin pedido ni ítems; stock del válido sin cambios', async (_name, validId, ghostId) => {
    const a = await withProduct(validId);
    const spy = spyOnPrisma(db);
    const spied = createOrderService({ prisma: spy.prisma });

    await expect(
      (async () =>
        spied.confirmOrder({
          customerId,
          items: [
            { productId: ghostId, quantity: 1, shownUnitPrice: '100.00' },
            { productId: a, quantity: 2, shownUnitPrice: '100.00' },
          ],
        }))(),
    ).rejects.toBeInstanceOf(Error);

    expect(spy.attempts()).toBe(1);
    expect(spy.calls.filter((c) => c.where === 'prisma')).toEqual([]);
    await expectNothingPersisted({ [a]: 10 });
  });

  test('ESC-37 · el error es el mismo de las demás entradas inválidas (misma clase que una lista vacía) y no un cuarto motivo de rechazo', async () => {
    const a = await insertProduct(db, { price: '100.00', currentStock: 10 });
    const caught = async (items: { productId: number; quantity: number; shownUnitPrice: string }[]) => {
      try {
        return await service.confirmOrder({ customerId, items });
      } catch (error) {
        return error;
      }
    };

    const emptyList = await caught([]);
    const ghost = await caught([
      { productId: a, quantity: 1, shownUnitPrice: '100.00' },
      { productId: GHOST_HIGH, quantity: 1, shownUnitPrice: '100.00' },
    ]);

    expect(emptyList).toBeInstanceOf(Error);
    expect(ghost).toBeInstanceOf(Error);
    expect((ghost as Error).constructor).toBe((emptyList as Error).constructor);
    expect(ghost).not.toHaveProperty('ok');
    expect(ghost).not.toHaveProperty('rejections');
    await expectNothingPersisted({ [a]: 10 });
  });
});
