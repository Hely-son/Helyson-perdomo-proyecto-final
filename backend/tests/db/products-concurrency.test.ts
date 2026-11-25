import type { Express } from 'express';
import { type RealServer, withRealServer } from '../helpers/concurrent-http';
import { validTestToken } from '../helpers/jwt';
import {
  buildProductsApp,
  connectTestPrisma,
  type Db,
  forcedInterleave,
  insertProduct,
  type JsonResult,
  PRODUCTS,
  productRowOrThrow,
  sendJson,
} from './helpers/products';

// Pruebas de aceptación de TK-03.1 · concurrencia de la edición general contra PostgreSQL real (RNF-01, RNF-04).
// Spec 02 §7 (DP-06), §11.5: ESC-35, ESC-36 y ESC-37 parcial (D1: solo updateProduct ∥ deactivateProduct;
// la parte de adjustProductStock queda para TK-03.2). Matriz: docs/qa/TK-03.1-matrix.md.
//
// Peticiones HTTP reales en paralelo contra un servidor en un puerto efímero (withRealServer, una conexión por
// petición), en dos variantes por escenario:
//  · ráfaga: N rondas de peticiones simultáneas sin intervención;
//  · intercalado forzado: una transacción de la prueba bloquea la fila (SELECT … FOR UPDATE, sin cambiarla) hasta que
//    las peticiones esperan el bloqueo; al confirmarla, todas las lecturas previas de la implementación ya están
//    hechas. Una implementación que lea el producto y lo reescriba completo pierde un cambio de forma determinista;
//    una actualización parcial (lo que exigen DP-06 y D3) los conserva. La prueba no exige transacciones ni bloqueos
//    a la implementación: el bloqueo es solo del arnés.
//
// Pruebas de aceptación de TK-03.2 · concurrencia del ajuste de stock (IN-02, CA-13, DP-06): ESC-15 y ESC-37 completo
// (updateProduct ∥ adjustProductStock ∥ deactivateProduct). Matriz: docs/qa/TK-03.2-matrix.md. El intercalado forzado
// de ESC-15 es la puerta de control de la atomicidad de la actualización condicional: si el servicio leyera el stock y
// luego actualizara por id, ambos ajustes leerían 10 antes de escribir y los dos se aplicarían de forma determinista.

jest.setTimeout(60_000);

const ROUNDS = 10;

let db: Db;
let app: Express;

beforeAll(async () => {
  db = await connectTestPrisma();
  app = buildProductsApp(db);
});
afterAll(async () => {
  await db?.$disconnect();
});

const token = () => validTestToken('1');
const byId = (id: number) => `${PRODUCTS}/${id}`;

function patch(server: RealServer, id: number, body: unknown): Promise<JsonResult> {
  return sendJson(server, 'PATCH', byId(id), token(), body);
}
function deactivate(server: RealServer, id: number): Promise<JsonResult> {
  return sendJson(server, 'POST', `${byId(id)}/deactivate`, token());
}
function adjust(server: RealServer, id: number, body: { newStock: number; expectedStock: number }): Promise<JsonResult> {
  return sendJson(server, 'PATCH', `${byId(id)}/stock`, token(), body);
}
function errorCode(result: JsonResult): unknown {
  return (result.body as { error?: { code?: unknown } } | undefined)?.error?.code;
}

// ---------------------------------------------------------------------------------------------
// ESC-35 · campos distintos en paralelo: se conservan ambos cambios
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-35 dos updateProduct en paralelo sobre campos distintos conservan ambos cambios', () => {
  test(`ESC-35 ráfaga (${ROUNDS} rondas): nombre "N1"→"N2" ∥ precio "100.00"→"120.00" → ambas 200; queda "N2" y "120.00"`, async () => {
    await withRealServer(app, async (server) => {
      for (let round = 0; round < ROUNDS; round++) {
        const id = await insertProduct(db, { name: 'N1', price: '100.00', currentStock: 10, minStockAlert: 3 });
        const [byName, byPrice] = await Promise.all([patch(server, id, { name: 'N2' }), patch(server, id, { price: '120.00' })]);
        expect({ round, status: [byName.status, byPrice.status] }).toEqual({ round, status: [200, 200] });
        const row = await productRowOrThrow(db, id);
        expect({ round, name: row.name, price: row.price, stock: row.current_stock, active: row.is_active }).toEqual({
          round,
          name: 'N2',
          price: '120.00',
          stock: 10,
          active: true,
        });
      }
    });
  });

  test('ESC-35 intercalado forzado: ambas peticiones leen antes de escribir → ambas 200; queda "N2" y "120.00"', async () => {
    const id = await insertProduct(db, { name: 'N1', price: '100.00', currentStock: 10, minStockAlert: 3 });
    const { results, blocked } = await withRealServer(app, (server) =>
      forcedInterleave(id, [() => patch(server, id, { name: 'N2' }), () => patch(server, id, { price: '120.00' })]),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(blocked).toBe(true);
    const row = await productRowOrThrow(db, id);
    expect({ name: row.name, price: row.price, stock: row.current_stock, active: row.is_active }).toEqual({
      name: 'N2',
      price: '120.00',
      stock: 10,
      active: true,
    });
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-36 · mismo campo en paralelo: gana la última escritura aplicada y confirmada
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-36 dos updateProduct en paralelo sobre el precio: gana la última escritura', () => {
  test(`ESC-36 ráfaga (${ROUNDS} rondas): precio → "110.00" ∥ "120.00" → ambas 200; el precio final es uno de los dos`, async () => {
    await withRealServer(app, async (server) => {
      for (let round = 0; round < ROUNDS; round++) {
        const id = await insertProduct(db, { price: '100.00', currentStock: 6 });
        const [a, b] = await Promise.all([patch(server, id, { price: '110.00' }), patch(server, id, { price: '120.00' })]);
        expect({ round, status: [a.status, b.status] }).toEqual({ round, status: [200, 200] });
        const row = await productRowOrThrow(db, id);
        expect({ round, priceIsOneOfBoth: ['110.00', '120.00'].includes(row.price), stock: row.current_stock }).toEqual({
          round,
          priceIsOneOfBoth: true,
          stock: 6,
        });
      }
    });
  });

  test('ESC-36 intercalado forzado y ordenado: "110.00" se aplica primero y "120.00" después → ambas 200; el precio final es "120.00"', async () => {
    const id = await insertProduct(db, { price: '100.00', currentStock: 6 });
    const { results, blocked } = await withRealServer(app, (server) =>
      forcedInterleave(id, [() => patch(server, id, { price: '110.00' }), () => patch(server, id, { price: '120.00' })]),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(blocked).toBe(true);
    const row = await productRowOrThrow(db, id);
    expect(row.price).toBe('120.00');
    expect(row.current_stock).toBe(6);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-37 (parcial, D1) · updateProduct ∥ deactivateProduct: precio e inactivo se conservan; stock intacto
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-37 parcial (D1) updateProduct ∥ deactivateProduct no se sobrescriben', () => {
  test(`ESC-37 parcial ráfaga (${ROUNDS} rondas): precio "100.00"→"120.00" ∥ desactivar → ambas 200; queda "120.00", inactivo y stock 10`, async () => {
    await withRealServer(app, async (server) => {
      for (let round = 0; round < ROUNDS; round++) {
        const id = await insertProduct(db, { price: '100.00', currentStock: 10, minStockAlert: 3, isActive: true });
        const [upd, deact] = await Promise.all([patch(server, id, { price: '120.00' }), deactivate(server, id)]);
        expect({ round, status: [upd.status, deact.status] }).toEqual({ round, status: [200, 200] });
        const row = await productRowOrThrow(db, id);
        expect({ round, price: row.price, active: row.is_active, stock: row.current_stock, min: row.min_stock_alert }).toEqual({
          round,
          price: '120.00',
          active: false,
          stock: 10,
          min: 3,
        });
      }
    });
  });

  test.each([
    ['updateProduct primero', 'update-first'],
    ['deactivateProduct primero', 'deactivate-first'],
  ])('ESC-37 parcial intercalado forzado (%s) → ambas 200; queda "120.00", inactivo y stock 10', async (_label, order) => {
    const id = await insertProduct(db, { price: '100.00', currentStock: 10, minStockAlert: 3, isActive: true });
    const { results, blocked } = await withRealServer(app, (server) => {
      const upd = () => patch(server, id, { price: '120.00' });
      const deact = () => deactivate(server, id);
      return forcedInterleave(id, order === 'update-first' ? [upd, deact] : [deact, upd]);
    });
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(blocked).toBe(true);
    const row = await productRowOrThrow(db, id);
    expect({ price: row.price, active: row.is_active, stock: row.current_stock, min: row.min_stock_alert }).toEqual({
      price: '120.00',
      active: false,
      stock: 10,
      min: 3,
    });
  });
});

// =============================================================================================
// TK-03.2 · ESC-15 · dos ajustes simultáneos con el mismo expectedStock: exactamente uno se aplica
// =============================================================================================

describe('TK-03.2 · ESC-15 dos adjustProductStock en paralelo con expectedStock 10: uno 200 y otro 409 STOCK_CHANGED', () => {
  test(`ESC-15 ráfaga (${ROUNDS} rondas): newStock 20 ∥ 30 con expectedStock 10 → [200, 409] en cualquier orden; el stock final es el del 200`, async () => {
    await withRealServer(app, async (server) => {
      for (let round = 0; round < ROUNDS; round++) {
        const id = await insertProduct(db, { price: '100.00', currentStock: 10, minStockAlert: 3 });
        const [to20, to30] = await Promise.all([
          adjust(server, id, { newStock: 20, expectedStock: 10 }),
          adjust(server, id, { newStock: 30, expectedStock: 10 }),
        ]);
        expect({ round, status: [to20.status, to30.status].sort((a, b) => a - b) }).toEqual({ round, status: [200, 409] });
        const applied = to20.status === 200 ? 20 : 30;
        const rejected = to20.status === 200 ? to30 : to20;
        expect({ round, code: errorCode(rejected) }).toEqual({ round, code: 'STOCK_CHANGED' });
        const row = await productRowOrThrow(db, id);
        expect({ round, stock: row.current_stock, price: row.price, active: row.is_active }).toEqual({
          round,
          stock: applied,
          price: '100.00',
          active: true,
        });
      }
    });
  });

  test('ESC-15 intercalado forzado (puerta de atomicidad): el ajuste a 20 entra primero en la cola → 20: 200, 30: 409 STOCK_CHANGED; stock final 20', async () => {
    const id = await insertProduct(db, { price: '100.00', currentStock: 10, minStockAlert: 3 });
    const { results, blocked } = await withRealServer(app, (server) =>
      forcedInterleave(id, [
        () => adjust(server, id, { newStock: 20, expectedStock: 10 }),
        () => adjust(server, id, { newStock: 30, expectedStock: 10 }),
      ]),
    );
    expect(results.map((r) => r.status)).toEqual([200, 409]);
    expect(blocked).toBe(true);
    expect((results[0].body as { currentStock?: unknown }).currentStock).toBe(20);
    expect(errorCode(results[1])).toBe('STOCK_CHANGED');
    const row = await productRowOrThrow(db, id);
    expect(row.current_stock).toBe(20);
  });
});

// =============================================================================================
// TK-03.2 · ESC-37 completo · updateProduct ∥ adjustProductStock ∥ deactivateProduct no se sobrescriben
// =============================================================================================

describe('TK-03.2 · ESC-37 updateProduct ∥ adjustProductStock ∥ deactivateProduct conservan los tres cambios', () => {
  const EXPECTED = { price: '120.00', stock: 4, active: false, min: 3 };

  test(`ESC-37 ráfaga (${ROUNDS} rondas): precio "120.00" ∥ stock 10→4 ∥ desactivar → las tres 200; queda "120.00", stock 4, inactivo, mínimo 3`, async () => {
    await withRealServer(app, async (server) => {
      for (let round = 0; round < ROUNDS; round++) {
        const id = await insertProduct(db, { price: '100.00', currentStock: 10, minStockAlert: 3, isActive: true });
        const [upd, adj, deact] = await Promise.all([
          patch(server, id, { price: '120.00' }),
          adjust(server, id, { newStock: 4, expectedStock: 10 }),
          deactivate(server, id),
        ]);
        expect({ round, status: [upd.status, adj.status, deact.status] }).toEqual({ round, status: [200, 200, 200] });
        const row = await productRowOrThrow(db, id);
        expect({ round, price: row.price, stock: row.current_stock, active: row.is_active, min: row.min_stock_alert }).toEqual({
          round,
          ...EXPECTED,
        });
      }
    });
  });

  test.each([
    ['ajuste primero', 'adjust-first'],
    ['ajuste en medio', 'adjust-middle'],
    ['ajuste al final', 'adjust-last'],
  ])('ESC-37 intercalado forzado (%s) → las tres 200; queda "120.00", stock 4, inactivo, mínimo 3', async (_label, order) => {
    const id = await insertProduct(db, { price: '100.00', currentStock: 10, minStockAlert: 3, isActive: true });
    const { results, blocked } = await withRealServer(app, (server) => {
      const upd = () => patch(server, id, { price: '120.00' });
      const adj = () => adjust(server, id, { newStock: 4, expectedStock: 10 });
      const deact = () => deactivate(server, id);
      const calls = order === 'adjust-first' ? [adj, upd, deact] : order === 'adjust-middle' ? [upd, adj, deact] : [upd, deact, adj];
      return forcedInterleave(id, calls);
    });
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(blocked).toBe(true);
    const row = await productRowOrThrow(db, id);
    expect({ price: row.price, stock: row.current_stock, active: row.is_active, min: row.min_stock_alert }).toEqual(EXPECTED);
  });
});
