import type { Client } from 'pg';
import { createOrderService } from '../../src/modules/orders/orders.service';
import {
  confirm,
  confirmedOrder,
  consumed,
  formatOrderNumber,
  injectInsertFailure,
  insertCustomer,
  type InjectionTarget,
  orderCounts,
  readSequence,
  setSequence,
  stockOf,
  type SequenceState,
} from './helpers/orders';
import { connectTestPrisma, insertProduct, type Db } from './helpers/products';
import { connectTestDatabase } from './helpers/test-database';

// Pruebas de aceptación de TK-05.3 · número de pedido y ROLLBACK (spec 04 ESC-02, ESC-03, ESC-14; RN-04, RNF-03).
// Nivel I contra medsupply_test (`npm run test:db`).
//
// Aislamiento de la secuencia order_number_seq (condición C): es global y no se revierte. `test:db` la reinicia a 1
// antes de cada test (reset-before-each.ts, resetDatabase), de modo que cada test parte de "base recién migrada".
// Estas pruebas NO la reinician: leen su estado antes y después y afirman en términos relativos a lo leído
// (ESC-03, ESC-14). Solo ESC-02 la mueve con setval (protegido por assertTestDatabase) y restaura el estado
// exacto que leyó. ESC-02 verifica antes su precondición ("recién migrada": ninguna asignación previa) y, si el
// arnés no la cumple, falla con ese diagnóstico en lugar de dar un falso verde o rojo.
// Matriz: docs/qa/TK-05.3-matrix.md.

let db: Db;
let client: Client;
let service: ReturnType<typeof createOrderService>;
let customerId: number;
let cleanup: (() => Promise<void>) | undefined;

beforeAll(async () => {
  db = await connectTestPrisma();
  client = await connectTestDatabase();
  service = createOrderService({ prisma: db });
});

afterAll(async () => {
  await client?.end();
  await db?.$disconnect();
});

beforeEach(async () => {
  customerId = await insertCustomer(db);
});

afterEach(async () => {
  // El disparador de fallo se retira siempre, aunque el test falle.
  await cleanup?.();
  cleanup = undefined;
});

async function newOrder(price = '10.00') {
  const product = await insertProduct(db, { price, currentStock: 10 });
  return confirm(service, { customerId, items: [{ productId: product, quantity: 1, shownUnitPrice: price }] });
}

describe('TK-05.3 · ESC-02 · MED-00001 y el paso a seis dígitos (RN-04)', () => {
  test('ESC-02 · base recién migrada: el primer pedido es MED-00001 y, con la secuencia forzada a 99 999, el segundo es MED-100000 (seis dígitos, sin recorte)', async () => {
    const original: SequenceState = await readSequence(client);
    try {
      // Precondición del escenario (garantizada por el arnés): la secuencia no se ha usado.
      expect(consumed(original)).toBe(0);

      const first = confirmedOrder(await newOrder());
      expect(first.orderNumber).toBe('MED-00001');

      await setSequence(client, 99999, true);
      const second = confirmedOrder(await newOrder());
      expect(second.orderNumber).toBe('MED-100000');

      const rows = await db.order.findMany({ select: { orderNumber: true }, orderBy: { id: 'asc' } });
      expect(rows.map((r) => r.orderNumber)).toEqual(['MED-00001', 'MED-100000']);
    } finally {
      await setSequence(client, original.lastValue, original.isCalled);
    }
  });

  test('RN-04 · números únicos y crecientes: dos pedidos consecutivos reciben números estrictamente crecientes (relativo a lo leído)', async () => {
    const before = consumed(await readSequence(client));

    const first = confirmedOrder(await newOrder());
    const second = confirmedOrder(await newOrder());

    expect(first.orderNumber).toBe(formatOrderNumber(before + 1));
    expect(second.orderNumber).toBe(formatOrderNumber(before + 2));
  });
});

describe('TK-05.3 · ESC-14 / ESC-03 · fallo antes del COMMIT: ROLLBACK total y la secuencia avanza (RNF-03, RN-04)', () => {
  test.each<[string, InjectionTarget]>([
    ['al insertar los ítems', 'order_items'],
    ['al insertar el pedido', 'orders'],
  ])('ESC-14 · fallo inyectado %s: la confirmación falla, sin pedido ni ítems, el stock de todos los productos no cambia y la secuencia avanzó', async (_name, target) => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 10 });
    const b = await insertProduct(db, { name: 'B', price: '50.00', currentStock: 5 });
    const before = await stockOf(db, [a, b]);
    const sequenceBefore = await readSequence(client);
    cleanup = await injectInsertFailure(client, target);

    await expect(
      confirm(service, {
        customerId,
        items: [
          { productId: a, quantity: 2, shownUnitPrice: '100.00' },
          { productId: b, quantity: 1, shownUnitPrice: '50.00' },
        ],
      }),
    ).rejects.toThrow();

    expect(await orderCounts(db)).toEqual({ orders: 0, items: 0 });
    expect(await stockOf(db, [a, b])).toEqual(before);
    // La secuencia no se revierte: el número consumido por el INSERT revertido es el salto de RN-04.
    expect(consumed(await readSequence(client))).toBeGreaterThan(consumed(sequenceBefore));
  });

  test('ESC-03 · tras la confirmación revertida (ESC-14), el siguiente pedido válido recibe un número posterior al consumido; el salto se acepta', async () => {
    const a = await insertProduct(db, { name: 'A', price: '100.00', currentStock: 10 });
    const sequenceBefore = await readSequence(client);
    const removeFailure = await injectInsertFailure(client, 'order_items');
    await expect(confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] })).rejects.toThrow();
    await removeFailure();
    const afterFailure = consumed(await readSequence(client));
    expect(afterFailure).toBeGreaterThan(consumed(sequenceBefore));

    const order = confirmedOrder(await confirm(service, { customerId, items: [{ productId: a, quantity: 1, shownUnitPrice: '100.00' }] }));

    // El número consumido por el pedido revertido no se reutiliza: el válido recibe el siguiente al último entregado.
    expect(order.orderNumber).toBe(formatOrderNumber(afterFailure + 1));
    expect(await stockOf(db, [a])).toEqual({ [a]: 9 });
    expect(await orderCounts(db)).toEqual({ orders: 1, items: 1 });
  });
});
