import { readFileSync } from 'node:fs';
import path from 'node:path';
import request, { type Response } from 'supertest';
import type { Express } from 'express';
import { expectErrorResponse } from '../helpers/error-response';
import { nowSeconds, QA_OTHER_SECRET, signTestJwt, validTestToken } from '../helpers/jwt';
import {
  allProductRows,
  buildProductsApp,
  connectTestPrisma,
  type Db,
  expectProductListShape,
  expectProductMatchesRow,
  expectProductShape,
  insertOrderWithItem,
  insertProduct,
  orderSnapshot,
  PRODUCTS,
  productRowOrThrow,
} from './helpers/products';

// Pruebas de aceptación de TK-03.1 · endpoints de productos contra PostgreSQL real (medsupply_test, RNF-01).
// Spec 02 §5.3, F-1..F-4, §7 (DP-06), §9, §11.1 y §11.5; contrato docs/openapi.yaml, tag Products (RNF-02):
// listProducts, createProduct, getProduct, updateProduct, deactivateProduct.
// Escenarios: ESC-01..04, ESC-06..10, ESC-32, ESC-33 (nivel I) y seguimientos ESC-29 y O-3 de TK-01.1.
// Matriz: docs/qa/TK-03.1-matrix.md. Decisiones de la puerta 1 (2026-11-25): D1, D2, D3.
// Los pedidos de ESC-03 y ESC-06 se insertan como fixtures Prisma (D2). Las partes de listStockAlerts (TK-04.1)
// y del catálogo del chat (TK-05.x) quedan pendientes en la matriz.
// La limpieza global vacía la base antes de cada test. Secretos y datos ficticios; ningún test imprime tokens.
//
// Pruebas de aceptación de TK-03.2 · ajuste manual de stock con control optimista (adjustProductStock, IN-02, CA-13).
// Spec 02 F-5, §7, §8.1, §9, §11.2 y §11.5; contrato PATCH /products/{productId}/stock, schema AdjustStockRequest.
// Escenarios: ESC-11, 12, 13 (fixture, D1), 16, 17 parcial, 34 parcial (nivel I) y la rama adjustProductStock de
// ESC-09, §9 id, ESC-10 y O-3. ESC-15 y ESC-37 completo están en products-concurrency.test.ts.
// Matriz: docs/qa/TK-03.2-matrix.md.

let db: Db;
let app: Express;

beforeAll(async () => {
  db = await connectTestPrisma();
  app = buildProductsApp(db);
});
afterAll(async () => {
  await db?.$disconnect();
});

const auth = () => `Bearer ${validTestToken('1')}`;
const byId = (id: number | string) => `${PRODUCTS}/${id}`;
const deactivatePath = (id: number | string) => `${PRODUCTS}/${id}/deactivate`;

const listProducts = () => request(app).get(PRODUCTS).set('Authorization', auth());
const getProduct = (id: number | string) => request(app).get(byId(id)).set('Authorization', auth());
const createProduct = (body: unknown) =>
  request(app).post(PRODUCTS).set('Authorization', auth()).set('Content-Type', 'application/json').send(JSON.stringify(body));
const updateProduct = (id: number | string, body: unknown) =>
  request(app).patch(byId(id)).set('Authorization', auth()).set('Content-Type', 'application/json').send(JSON.stringify(body));
const deactivateProduct = (id: number | string) => request(app).post(deactivatePath(id)).set('Authorization', auth());
const stockPath = (id: number | string) => `${PRODUCTS}/${id}/stock`;
const adjustProductStock = (id: number | string, body: unknown) =>
  request(app).patch(stockPath(id)).set('Authorization', auth()).set('Content-Type', 'application/json').send(JSON.stringify(body));

const VALID_CREATE = { name: 'Guantes de nitrilo', price: '1250.00', currentStock: 10, minStockAlert: 3 };

function expectValidationError(res: Response): void {
  expectErrorResponse(res, 422, 'VALIDATION_ERROR');
}

// ---------------------------------------------------------------------------------------------
// ESC-01 · crear producto (IN-01, US-03 crit. 1)
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-01 createProduct crea un producto activo', () => {
  test('ESC-01 createProduct con nombre, precio "1250.00", stock 10 y mínimo 3 → 201 Product activo, guardado y presente en listProducts', async () => {
    const res = await createProduct(VALID_CREATE);
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expectProductShape(res.body);
    expect(res.body).toMatchObject({
      name: 'Guantes de nitrilo',
      description: null,
      price: '1250.00',
      currentStock: 10,
      minStockAlert: 3,
      isActive: true,
    });

    const rows = await allProductRows(db);
    expect(rows).toHaveLength(1);
    expectProductMatchesRow(res.body, rows[0]);

    const list = await listProducts();
    expect(list.status).toBe(200);
    expect(expectProductListShape(list.body)).toEqual([res.body]);
  });

  test('ESC-01 contrato: createProduct con descripción conserva el texto y serializa el precio con dos decimales ("100.50", no "100.5")', async () => {
    const res = await createProduct({ name: 'Alcohol gel', description: 'Frasco de 1 L', price: '100.50', currentStock: 0, minStockAlert: 0 });
    expect(res.status).toBe(201);
    expectProductShape(res.body);
    expect(res.body).toMatchObject({ description: 'Frasco de 1 L', price: '100.50', currentStock: 0, minStockAlert: 0, isActive: true });
    expectProductMatchesRow(res.body, await productRowOrThrow(db, res.body.id));
  });

  test.each([
    ['precio mínimo "0.01"', { price: '0.01' }],
    ['precio máximo de numeric(12,2) "9999999999.99"', { price: '9999999999.99' }],
    ['stock 0 y mínimo 0', { currentStock: 0, minStockAlert: 0 }],
    ['stock y mínimo en el máximo int32 (2147483647)', { currentStock: 2147483647, minStockAlert: 2147483647 }],
    ['nombre de 200 caracteres', { name: 'N'.repeat(200) }],
    ['descripción de 2000 caracteres', { description: 'D'.repeat(2000) }],
    ['descripción null', { description: null }],
  ])('ESC-01 contrato (límites aceptados): createProduct con %s → 201 y el producto se guarda', async (_label, override) => {
    const res = await createProduct({ ...VALID_CREATE, ...override });
    expect(res.status).toBe(201);
    expectProductShape(res.body);
    expect(res.body).toMatchObject({ ...override, isActive: true });
    expectProductMatchesRow(res.body, await productRowOrThrow(db, res.body.id));
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-02 · validaciones de createProduct (IN-01, RN-01, US-03 crit. 2)
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-02 createProduct rechaza datos fuera de esquema sin crear nada', () => {
  const INVALID: [string, unknown][] = [
    // Casos literales de ESC-02.
    ['precio "0.00"', { ...VALID_CREATE, price: '0.00' }],
    ['precio "1250" (sin dos decimales)', { ...VALID_CREATE, price: '1250' }],
    ['stock −1 (RN-01)', { ...VALID_CREATE, currentStock: -1 }],
    ['mínimo −1', { ...VALID_CREATE, minStockAlert: -1 }],
    ['stock 2.5 (no entero)', { ...VALID_CREATE, currentStock: 2.5 }],
    // Resto del esquema CreateProductRequest y MoneyInput (RNF-02).
    ['precio "00.00"', { ...VALID_CREATE, price: '00.00' }],
    ['precio "1250.5"', { ...VALID_CREATE, price: '1250.5' }],
    ['precio "1250.505"', { ...VALID_CREATE, price: '1250.505' }],
    ['precio negativo "-10.00"', { ...VALID_CREATE, price: '-10.00' }],
    ['precio con separador de miles "1,250.00"', { ...VALID_CREATE, price: '1,250.00' }],
    ['precio numérico 1250 (no string)', { ...VALID_CREATE, price: 1250 }],
    ['precio con 11 dígitos enteros', { ...VALID_CREATE, price: '12345678901.00' }],
    ['precio null', { ...VALID_CREATE, price: null }],
    ['sin precio', { name: 'X', currentStock: 1, minStockAlert: 1 }],
    ['mínimo 2.5 (no entero)', { ...VALID_CREATE, minStockAlert: 2.5 }],
    ['stock como texto "10"', { ...VALID_CREATE, currentStock: '10' }],
    ['stock 2147483648 (> int32)', { ...VALID_CREATE, currentStock: 2147483648 }],
    ['mínimo 2147483648 (> int32)', { ...VALID_CREATE, minStockAlert: 2147483648 }],
    ['sin stock', { name: 'X', price: '1.00', minStockAlert: 1 }],
    ['sin mínimo', { name: 'X', price: '1.00', currentStock: 1 }],
    ['sin nombre', { price: '1.00', currentStock: 1, minStockAlert: 1 }],
    ['nombre vacío', { ...VALID_CREATE, name: '' }],
    ['nombre de 201 caracteres', { ...VALID_CREATE, name: 'N'.repeat(201) }],
    ['nombre no string', { ...VALID_CREATE, name: 123 }],
    ['descripción de 2001 caracteres', { ...VALID_CREATE, description: 'D'.repeat(2001) }],
    ['campo no permitido isActive', { ...VALID_CREATE, isActive: false }],
    ['campo no permitido id', { ...VALID_CREATE, id: 99 }],
    ['campo desconocido', { ...VALID_CREATE, sku: 'X-1' }],
    ['cuerpo arreglo', [VALID_CREATE]],
    ['cuerpo null', null],
    ['cuerpo cadena JSON', 'producto'],
    ['cuerpo vacío {}', {}],
  ];

  test.each(INVALID)('ESC-02 createProduct con %s → 422 VALIDATION_ERROR y no se crea ningún producto', async (_label, body) => {
    const res = await createProduct(body);
    expectValidationError(res);
    expect(await allProductRows(db)).toEqual([]);
  });

  test.each(['{"name": "Guantes", "price": ', 'no es json', '{name: "x"}'])(
    'contrato: createProduct con cuerpo que no es JSON válido (%s) → 400 MALFORMED_REQUEST y no se crea nada',
    async (raw) => {
      const res = await request(app).post(PRODUCTS).set('Authorization', auth()).set('Content-Type', 'application/json').send(raw);
      expectErrorResponse(res, 400, 'MALFORMED_REQUEST');
      expect(await allProductRows(db)).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// ESC-03 · cambio de precio sin efecto en pedidos existentes (RN-03, US-03 crit. 5)
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-03 el cambio de precio no afecta pedidos existentes (RN-03)', () => {
  test('ESC-03 producto "100.00" con pedido de 2 unidades; updateProduct a "150.00" → getProduct "150.00"; el ítem conserva unit_price 100.00 y el total 200.00', async () => {
    const id = await insertProduct(db, { price: '100.00', currentStock: 8, minStockAlert: 1 });
    const { orderId } = await insertOrderWithItem(db, id, { quantity: 2, unitPrice: '100.00', totalAmount: '200.00' });
    const orderBefore = await orderSnapshot(db, orderId);
    const before = await productRowOrThrow(db, id);

    const res = await updateProduct(id, { price: '150.00' });
    expect(res.status).toBe(200);
    const after = await productRowOrThrow(db, id);
    expectProductMatchesRow(res.body, after);
    expect(after.price).toBe('150.00');
    expect(after.current_stock).toBe(before.current_stock);

    const got = await getProduct(id);
    expect(got.status).toBe(200);
    expect(got.body.price).toBe('150.00');

    const orderAfter = await orderSnapshot(db, orderId);
    expect(orderAfter).toEqual(orderBefore);
    expect(orderAfter.items).toHaveLength(1);
    expect(orderAfter.items[0]).toMatchObject({ product_id: id, quantity: 2, unit_price: '100.00' });
    expect(orderAfter.order.total_amount).toBe('200.00');
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-04 y contrato de updateProduct (UpdateProductRequest, F-3, DP-06)
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-04 updateProduct no admite currentStock', () => {
  test.each([
    ['solo currentStock', { currentStock: 50 }],
    ['currentStock junto a nombre', { name: 'Nombre nuevo', currentStock: 50 }],
    ['currentStock junto a precio', { price: '150.00', currentStock: 50 }],
  ])('ESC-04 updateProduct con %s → 422 VALIDATION_ERROR; stock sigue en 10 y ningún campo cambia', async (_label, body) => {
    const id = await insertProduct(db, { currentStock: 10 });
    const before = await productRowOrThrow(db, id);
    const res = await updateProduct(id, body);
    expectValidationError(res);
    const after = await productRowOrThrow(db, id);
    expect(after).toEqual(before);
    expect(after.current_stock).toBe(10);
  });
});

describe('TK-03.1 · contrato updateProduct: validación estricta (UpdateProductRequest, additionalProperties: false, minProperties: 1)', () => {
  const INVALID: [string, unknown][] = [
    ['cuerpo vacío {} (minProperties: 1)', {}],
    ['campo desconocido', { sku: 'X-1' }],
    ['campo no permitido id', { id: 2 }],
    ['campo de solo lectura createdAt', { createdAt: '2026-11-25T00:00:00.000Z' }],
    ['precio "0.00"', { price: '0.00' }],
    ['precio "150" (sin dos decimales)', { price: '150' }],
    ['precio numérico 150', { price: 150 }],
    ['precio null', { price: null }],
    ['mínimo −1', { minStockAlert: -1 }],
    ['mínimo 1.5', { minStockAlert: 1.5 }],
    ['mínimo 2147483648 (> int32)', { minStockAlert: 2147483648 }],
    ['mínimo null', { minStockAlert: null }],
    ['nombre vacío', { name: '' }],
    ['nombre de 201 caracteres', { name: 'N'.repeat(201) }],
    ['nombre null', { name: null }],
    ['descripción de 2001 caracteres', { description: 'D'.repeat(2001) }],
    ['cuerpo arreglo', [{ name: 'X' }]],
    ['cuerpo null', null],
  ];

  test.each(INVALID)('contrato: updateProduct con %s → 422 VALIDATION_ERROR y el producto no cambia', async (_label, body) => {
    const id = await insertProduct(db);
    const before = await productRowOrThrow(db, id);
    const res = await updateProduct(id, body);
    expectValidationError(res);
    expect(await productRowOrThrow(db, id)).toEqual(before);
  });

  test('contrato: updateProduct con cuerpo que no es JSON válido → 400 MALFORMED_REQUEST y el producto no cambia', async () => {
    const id = await insertProduct(db);
    const before = await productRowOrThrow(db, id);
    const res = await request(app).patch(byId(id)).set('Authorization', auth()).set('Content-Type', 'application/json').send('{"name": ');
    expectErrorResponse(res, 400, 'MALFORMED_REQUEST');
    expect(await productRowOrThrow(db, id)).toEqual(before);
  });
});

describe('TK-03.1 · F-3 / DP-06 updateProduct modifica solo los campos recibidos', () => {
  const BASE = { name: 'Mascarilla N95', description: 'Caja de 20', price: '100.00', currentStock: 7, minStockAlert: 2 };

  test.each([
    ['nombre', { name: 'Mascarilla KN95' }],
    ['descripción', { description: 'Caja de 50' }],
    ['descripción a null', { description: null }],
    ['precio', { price: '120.50' }],
    ['mínimo', { minStockAlert: 0 }],
    ['nombre, precio y mínimo juntos', { name: 'Mascarilla quirúrgica', price: '80.00', minStockAlert: 9 }],
  ])('F-3: updateProduct con %s → 200 Product; solo cambian esos campos; stock e isActive intactos', async (_label, patch) => {
    const id = await insertProduct(db, BASE);
    const before = await productRowOrThrow(db, id);
    const res = await updateProduct(id, patch);
    expect(res.status).toBe(200);
    const after = await productRowOrThrow(db, id);
    expectProductMatchesRow(res.body, after);

    const expected = {
      name: before.name,
      description: before.description,
      price: before.price,
      min_stock_alert: before.min_stock_alert,
    };
    const p = patch as Record<string, unknown>;
    if ('name' in p) expected.name = p.name as string;
    if ('description' in p) expected.description = p.description as string | null;
    if ('price' in p) expected.price = p.price as string;
    if ('minStockAlert' in p) expected.min_stock_alert = p.minStockAlert as number;
    expect(after).toMatchObject({
      ...expected,
      id,
      current_stock: before.current_stock,
      is_active: before.is_active,
      created_at: before.created_at,
    });
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-06 · desactivar (RN-10, RN-09 solo estado persistido, US-03 crit. 6)
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-06 deactivateProduct desactiva sin borrar', () => {
  test('ESC-06 producto activo stock 2, mínimo 5 y con pedido → 200 isActive false; stock, precio y mínimo intactos; sigue en listProducts y getProduct; el pedido no cambia', async () => {
    const id = await insertProduct(db, { name: 'Jeringa 5 ml', price: '35.00', currentStock: 2, minStockAlert: 5, isActive: true });
    const { orderId } = await insertOrderWithItem(db, id, { quantity: 3, unitPrice: '35.00', totalAmount: '105.00' });
    const orderBefore = await orderSnapshot(db, orderId);
    const before = await productRowOrThrow(db, id);

    const res = await deactivateProduct(id);
    expect(res.status).toBe(200);
    const after = await productRowOrThrow(db, id);
    expectProductMatchesRow(res.body, after);
    expect(after).toMatchObject({
      id,
      name: before.name,
      description: before.description,
      price: '35.00',
      current_stock: 2,
      min_stock_alert: 5,
      is_active: false,
      created_at: before.created_at,
    });
    expect(await allProductRows(db)).toHaveLength(1);

    const got = await getProduct(id);
    expect(got.status).toBe(200);
    expectProductMatchesRow(got.body, after);

    const list = await listProducts();
    expect(list.status).toBe(200);
    expect(expectProductListShape(list.body)).toEqual([got.body]);

    expect(await orderSnapshot(db, orderId)).toEqual(orderBefore);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-07 · desactivación idempotente
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-07 desactivar un producto ya inactivo responde éxito y no cambia nada', () => {
  test('ESC-07 producto inactivo → deactivateProduct 200 Product; la fila queda idéntica (incluido updated_at)', async () => {
    const id = await insertProduct(db, { isActive: false, currentStock: 4, minStockAlert: 1 });
    const before = await productRowOrThrow(db, id);
    const res = await deactivateProduct(id);
    expect(res.status).toBe(200);
    expectProductMatchesRow(res.body, before);
    expect(await productRowOrThrow(db, id)).toEqual(before);
  });

  test('ESC-07 desactivar dos veces un producto activo → ambas 200; la segunda no modifica la fila', async () => {
    const id = await insertProduct(db, { isActive: true });
    const first = await deactivateProduct(id);
    expect(first.status).toBe(200);
    const afterFirst = await productRowOrThrow(db, id);
    expect(afterFirst.is_active).toBe(false);

    const second = await deactivateProduct(id);
    expect(second.status).toBe(200);
    expectProductMatchesRow(second.body, afterFirst);
    expect(await productRowOrThrow(db, id)).toEqual(afterFirst);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-08 · no existe borrado (RN-10)
// ---------------------------------------------------------------------------------------------

/** Métodos de todas las rutas registradas en la aplicación, recorriendo routers anidados (Express 5 / router 2.x). */
function registeredRouteMethods(express: Express): string[] {
  const methods: string[] = [];
  const walk = (stack: unknown[]): void => {
    for (const layer of stack as { route?: { methods: Record<string, boolean> }; handle?: { stack?: unknown[] } }[]) {
      if (layer.route) methods.push(...Object.keys(layer.route.methods).filter((m) => layer.route!.methods[m]));
      if (layer.handle && Array.isArray(layer.handle.stack)) walk(layer.handle.stack);
    }
  };
  walk((express as unknown as { router: { stack: unknown[] } }).router.stack);
  return methods;
}

describe('TK-03.1 · ESC-08 no existe borrado de productos', () => {
  test('ESC-08 (a) el contrato no declara ninguna operación delete y la aplicación no registra rutas DELETE ni comodín (all)', () => {
    const contract = readFileSync(path.resolve(__dirname, '../../../docs/openapi.yaml'), 'utf8');
    expect(contract).not.toMatch(/^ {4}delete:\s*$/m);
    expect(contract).not.toMatch(/operationId:\s*delete/i);

    const methods = registeredRouteMethods(app);
    // No vacío: las rutas de productos de TK-03.1 deben estar registradas (PATCH solo existe en updateProduct).
    expect(methods).toEqual(expect.arrayContaining(['get', 'post', 'patch']));
    expect(methods).not.toContain('delete');
    expect(methods).not.toContain('_all');
  });

  test('ESC-08 (b) DELETE sobre el recurso y sobre la colección con token válido no borra nada: getProduct devuelve los mismos datos', async () => {
    const id = await insertProduct(db);
    const otherId = await insertProduct(db, { name: 'Otro producto QA' });
    const before = await allProductRows(db);

    await request(app).delete(byId(id)).set('Authorization', auth());
    await request(app).delete(PRODUCTS).set('Authorization', auth());

    expect(await allProductRows(db)).toEqual(before);
    const got = await getProduct(id);
    expect(got.status).toBe(200);
    expectProductMatchesRow(got.body, before.find((r) => r.id === id)!);
    expect((await getProduct(otherId)).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-09 · producto inexistente; id no entero (spec 02 §9)
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 y TK-03.2 · ESC-09 producto inexistente → PRODUCT_NOT_FOUND sin efectos', () => {
  const MISSING = 999999;

  test.each([
    ['getProduct', () => getProduct(MISSING)],
    ['updateProduct', () => updateProduct(MISSING, { name: 'No existe' })],
    ['deactivateProduct', () => deactivateProduct(MISSING)],
    ['adjustProductStock', () => adjustProductStock(MISSING, { newStock: 5, expectedStock: 10 })],
  ])('ESC-09 %s con id inexistente → 404 PRODUCT_NOT_FOUND; no se crea ni modifica nada', async (_op, call) => {
    await insertProduct(db);
    const before = await allProductRows(db);
    const res = await call();
    expectErrorResponse(res, 404, 'PRODUCT_NOT_FOUND');
    expect(await allProductRows(db)).toEqual(before);
  });
});

describe('TK-03.1 y TK-03.2 · contrato: productId no entero o < 1 → 422 VALIDATION_ERROR sin efectos', () => {
  const BAD_IDS = ['abc', '1.5', '0', '-1'];
  const OPS: [string, (id: string) => request.Test][] = [
    ['getProduct', (id) => getProduct(id)],
    ['updateProduct', (id) => updateProduct(id, { name: 'X' })],
    ['deactivateProduct', (id) => deactivateProduct(id)],
    ['adjustProductStock', (id) => adjustProductStock(id, { newStock: 5, expectedStock: 10 })],
  ];
  const CASES = OPS.flatMap(([op, call]) => BAD_IDS.map((bad) => [op, bad, call] as const));

  test.each(CASES)('contrato: %s con productId "%s" → 422 VALIDATION_ERROR', async (_op, bad, call) => {
    await insertProduct(db);
    const before = await allProductRows(db);
    const res = await call(bad);
    expectValidationError(res);
    expect(await allProductRows(db)).toEqual(before);
  });

  test.each(OPS)('robustez: %s con productId 2147483648 (fuera de int4) → 404 PRODUCT_NOT_FOUND o 422 VALIDATION_ERROR, nunca 500', async (_op, call) => {
    await insertProduct(db);
    const before = await allProductRows(db);
    const res = await call('2147483648');
    expect([404, 422]).toContain(res.status);
    expectErrorResponse(res, res.status, res.status === 404 ? 'PRODUCT_NOT_FOUND' : 'VALIDATION_ERROR');
    expect(await allProductRows(db)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-10 · sin token / token inválido / expirado (AU-01, AU-03, CA-11) y O-3 de TK-01.1
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 y TK-03.2 · ESC-10 operaciones de productos sin sesión válida → 401 UNAUTHORIZED sin efectos', () => {
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
    ['listProducts', 'get', () => PRODUCTS, undefined],
    ['createProduct', 'post', () => PRODUCTS, VALID_CREATE],
    ['getProduct', 'get', (id) => byId(id), undefined],
    ['updateProduct', 'patch', (id) => byId(id), { name: 'Cambiado sin sesión', price: '1.00' }],
    ['deactivateProduct', 'post', (id) => deactivatePath(id), undefined],
    ['adjustProductStock', 'patch', (id) => stockPath(id), { newStock: 0, expectedStock: 10 }],
  ];
  const CASES = OPS.flatMap((op) => CREDENTIALS.map((cred) => [op[0], cred[0], op, cred[1]] as const));

  test.each(CASES)('ESC-10 %s %s → 401 UNAUTHORIZED y la base no cambia', async (_op, _cred, op, header) => {
    const id = await insertProduct(db);
    const before = await allProductRows(db);
    const [, method, url, body] = op;
    let req = (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url(id));
    const value = header();
    if (value !== undefined) req = req.set('Authorization', value);
    const res = body === undefined ? await req : await req.set('Content-Type', 'application/json').send(JSON.stringify(body));
    expectErrorResponse(res, 401, 'UNAUTHORIZED');
    expect(await allProductRows(db)).toEqual(before);
  });
});

describe('TK-03.1 y TK-03.2 · O-3 (TK-01.1) variantes de ruta sin token no quedan sin protección', () => {
  const VARIANTS: [string, string, unknown][] = [
    ['get', '/API/V1/PRODUCTS', undefined],
    ['post', '/API/V1/PRODUCTS', VALID_CREATE],
    ['get', '/api/v1/products/', undefined],
    ['post', '/api/v1/products/', VALID_CREATE],
    ['get', '/api/v1/products?orden=nombre', undefined],
    ['get', '/Api/V1/Products/{id}', undefined],
    ['get', '/api/v1/products/{id}/', undefined],
    ['patch', '/API/V1/PRODUCTS/{id}', { name: 'Cambiado sin sesión' }],
    ['patch', '/api/v1/products/{id}/', { name: 'Cambiado sin sesión' }],
    ['post', '/API/V1/PRODUCTS/{id}/DEACTIVATE', undefined],
    ['post', '/api/v1/products/{id}/deactivate/', undefined],
    ['delete', '/API/V1/PRODUCTS/{id}', undefined],
    ['patch', '/API/V1/PRODUCTS/{id}/STOCK', { newStock: 0, expectedStock: 10 }],
    ['patch', '/api/v1/products/{id}/stock/', { newStock: 0, expectedStock: 10 }],
  ];

  test.each(VARIANTS)('O-3: %s %s sin token → 401 UNAUTHORIZED y la base no cambia', async (method, template, body) => {
    const id = await insertProduct(db);
    const before = await allProductRows(db);
    const url = template.replace('{id}', String(id));
    const req = (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url);
    const res = body === undefined ? await req : await req.set('Content-Type', 'application/json').send(JSON.stringify(body));
    expectErrorResponse(res, 401, 'UNAUTHORIZED');
    expect(await allProductRows(db)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-29 (seguimiento TK-01.1) y F-1 · listProducts / getProduct con token válido
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-29 y F-1 listProducts y getProduct con token válido', () => {
  test('ESC-29 listProducts con token válido sobre catálogo vacío → 200 { items: [] }', async () => {
    const res = await listProducts();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ items: [] });
  });

  test('F-1 / contrato: listProducts devuelve activos e inactivos, ordenados por nombre ascendente, con el precio como cadena de dos decimales', async () => {
    // Insertados en orden distinto al alfabético para que el orden por id no coincida con el esperado.
    const ids = {
      mascarillas: await insertProduct(db, { name: 'Mascarillas', price: '20.00', isActive: true }),
      alcohol: await insertProduct(db, { name: 'Alcohol', price: '100.50', isActive: false }),
      jeringas: await insertProduct(db, { name: 'Jeringas', price: '3.10', isActive: true }),
      guantes: await insertProduct(db, { name: 'Guantes', price: '1250.00', isActive: false }),
    };
    const res = await listProducts();
    expect(res.status).toBe(200);
    const items = expectProductListShape(res.body);
    expect(items.map((p) => p.name)).toEqual(['Alcohol', 'Guantes', 'Jeringas', 'Mascarillas']);
    expect(items.map((p) => p.price)).toEqual(['100.50', '1250.00', '3.10', '20.00']);
    expect(items.map((p) => p.isActive)).toEqual([false, false, true, true]);
    for (const item of items) expectProductMatchesRow(item, await productRowOrThrow(db, item.id as number));
    expect(new Set(items.map((p) => p.id))).toEqual(new Set(Object.values(ids)));
  });

  test('F-1 / contrato: getProduct de un producto existente → 200 Product igual a la fila (precio "100.00", no "100")', async () => {
    const id = await insertProduct(db, { name: 'Termómetro', description: null, price: '100.00', currentStock: 0, minStockAlert: 0 });
    const res = await getProduct(id);
    expect(res.status).toBe(200);
    expectProductMatchesRow(res.body, await productRowOrThrow(db, id));
    expect(res.body.price).toBe('100.00');
    expect(res.body.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-32 · edición de un producto inactivo (DP-02)
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-32 updateProduct sobre un producto inactivo se aplica y no lo reactiva', () => {
  test.each([
    ['nombre', { name: 'Gasa estéril' }],
    ['descripción', { description: 'Paquete de 10' }],
    ['precio', { price: '45.90' }],
    ['mínimo hasta dejar stock ≤ mínimo', { minStockAlert: 5 }],
    ['todos los campos editables', { name: 'Gasa', description: null, price: '9.99', minStockAlert: 2 }],
  ])('ESC-32 inactivo (stock 2, mínimo 1): updateProduct de %s → 200; aplicado; sigue inactivo con stock 2', async (_label, patch) => {
    const id = await insertProduct(db, { name: 'Gasa', description: 'Paquete', price: '10.00', currentStock: 2, minStockAlert: 1, isActive: false });
    const res = await updateProduct(id, patch);
    expect(res.status).toBe(200);
    const after = await productRowOrThrow(db, id);
    expectProductMatchesRow(res.body, after);
    expect(after.is_active).toBe(false);
    expect(after.current_stock).toBe(2);
    expect(res.body).toMatchObject({ ...patch, isActive: false, currentStock: 2 });

    const got = await getProduct(id);
    expect(got.status).toBe(200);
    expect(got.body).toEqual(res.body);
    const list = await listProducts();
    expect(expectProductListShape(list.body)).toEqual([res.body]);
  });
});

// ---------------------------------------------------------------------------------------------
// ESC-33 · no existe reactivación (DP-01)
// ---------------------------------------------------------------------------------------------

describe('TK-03.1 · ESC-33 updateProduct no admite isActive; no existe operación de activación', () => {
  test.each([
    ['isActive: true solo', { isActive: true }],
    ['isActive: true junto a nombre', { name: 'Reactivado', isActive: true }],
    ['isActive: true junto a precio', { price: '1.00', isActive: true }],
    ['isActive: false', { isActive: false }],
  ])('ESC-33 inactivo: updateProduct con %s → 422 VALIDATION_ERROR; sigue inactivo y ningún campo cambia', async (_label, body) => {
    const id = await insertProduct(db, { isActive: false });
    const before = await productRowOrThrow(db, id);
    const res = await updateProduct(id, body);
    expectValidationError(res);
    expect(await productRowOrThrow(db, id)).toEqual(before);
  });

  test('ESC-33 el contrato no declara ninguna operación de activación (solo /deactivate)', () => {
    const contract = readFileSync(path.resolve(__dirname, '../../../docs/openapi.yaml'), 'utf8');
    const paths = [...contract.matchAll(/^ {2}(\/[^\s:]+):\s*$/gm)].map((m) => m[1]);
    expect(paths).toContain('/products/{productId}/deactivate');
    expect(paths.filter((p) => /activ/i.test(p))).toEqual(['/products/{productId}/deactivate']);
    expect(contract).not.toMatch(/operationId:\s*(re)?activate/i);
  });

  test('ESC-33 peticiones de activación con token válido no reactivan el producto (sin exigir código concreto)', async () => {
    const id = await insertProduct(db, { isActive: false });
    const before = await productRowOrThrow(db, id);
    await request(app).post(`${byId(id)}/activate`).set('Authorization', auth());
    await request(app).post(`${byId(id)}/reactivate`).set('Authorization', auth());
    await request(app).patch(`${byId(id)}/status`).set('Authorization', auth()).send({ isActive: true });
    expect(await productRowOrThrow(db, id)).toEqual(before);
    const got = await getProduct(id);
    expect(got.status).toBe(200);
    expect(got.body.isActive).toBe(false);
  });
});

// =============================================================================================
// TK-03.2 · adjustProductStock: ajuste absoluto con control optimista (IN-02, RN-01, CA-13)
// =============================================================================================

/** Campos de la fila que el ajuste no puede tocar (solo cambian current_stock y updated_at). */
function untouchedByAdjust(row: { name: string; description: string | null; price: string; min_stock_alert: number; is_active: boolean; created_at: Date; id: number }) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    min_stock_alert: row.min_stock_alert,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

const STOCK_BASE = { name: 'Guantes de látex', description: 'Caja de 100', price: '100.00', currentStock: 10, minStockAlert: 3, isActive: true };

describe('TK-03.2 · ESC-11 / CA-13 adjustProductStock con el stock vigente se aplica', () => {
  test('ESC-11 stock 10; newStock 25, expectedStock 10 → 200 Product con stock 25 igual a la fila; el resto de campos intactos', async () => {
    const id = await insertProduct(db, STOCK_BASE);
    const before = await productRowOrThrow(db, id);

    const res = await adjustProductStock(id, { newStock: 25, expectedStock: 10 });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    const after = await productRowOrThrow(db, id);
    expectProductMatchesRow(res.body, after);
    expect(res.body.currentStock).toBe(25);
    expect(after.current_stock).toBe(25);
    expect(untouchedByAdjust(after)).toEqual(untouchedByAdjust(before));
    expect(await allProductRows(db)).toHaveLength(1);
  });

  test('ESC-11 límite: newStock igual a expectedStock (10 → 10) → 200 con stock 10 (sin exigir nada sobre updated_at)', async () => {
    const id = await insertProduct(db, STOCK_BASE);
    const before = await productRowOrThrow(db, id);

    const res = await adjustProductStock(id, { newStock: 10, expectedStock: 10 });
    expect(res.status).toBe(200);
    const after = await productRowOrThrow(db, id);
    expectProductMatchesRow(res.body, after);
    expect(after.current_stock).toBe(10);
    expect(untouchedByAdjust(after)).toEqual(untouchedByAdjust(before));
  });
});

describe('TK-03.2 · ESC-12 / CA-13 adjustProductStock con expectedStock desactualizado → STOCK_CHANGED', () => {
  test('ESC-12 stock 10; newStock 25, expectedStock 8 → 409 STOCK_CHANGED; la fila queda idéntica', async () => {
    const id = await insertProduct(db, STOCK_BASE);
    const before = await productRowOrThrow(db, id);

    const res = await adjustProductStock(id, { newStock: 25, expectedStock: 8 });
    expectErrorResponse(res, 409, 'STOCK_CHANGED');
    expect(await productRowOrThrow(db, id)).toEqual(before);
  });
});

describe('TK-03.2 · ESC-13 (fixture, D1) el stock cambia entre la lectura del operador y el ajuste', () => {
  test('ESC-13 getProduct lee 10; el stock pasa a 7 directamente en PostgreSQL; ajuste newStock 25, expectedStock 10 → 409 STOCK_CHANGED; queda 7 y getProduct devuelve 7', async () => {
    const id = await insertProduct(db, STOCK_BASE);
    const read = await getProduct(id);
    expect(read.status).toBe(200);
    expect(read.body.currentStock).toBe(10);

    // Fixture (D1): simula el descuento de un pedido confirmado de 3 unidades. El pedido real queda para TK-05.3.
    await db.$executeRaw`UPDATE products SET current_stock = 7 WHERE id = ${id}`;
    const changed = await productRowOrThrow(db, id);
    expect(changed.current_stock).toBe(7);

    const res = await adjustProductStock(id, { newStock: 25, expectedStock: read.body.currentStock });
    expectErrorResponse(res, 409, 'STOCK_CHANGED');
    expect(await productRowOrThrow(db, id)).toEqual(changed);

    const reread = await getProduct(id);
    expect(reread.status).toBe(200);
    expect(reread.body.currentStock).toBe(7);
  });
});

describe('TK-03.2 · ESC-17 (parcial) ajustar a 0 un producto activo', () => {
  test('ESC-17 activo stock 10; newStock 0, expectedStock 10 → 200 stock 0; sigue activo (alertas: TK-04.1; "Sin stock" del chat: TK-05.2)', async () => {
    const id = await insertProduct(db, STOCK_BASE);
    const before = await productRowOrThrow(db, id);

    const res = await adjustProductStock(id, { newStock: 0, expectedStock: 10 });
    expect(res.status).toBe(200);
    const after = await productRowOrThrow(db, id);
    expectProductMatchesRow(res.body, after);
    expect(res.body).toMatchObject({ currentStock: 0, isActive: true });
    expect(untouchedByAdjust(after)).toEqual(untouchedByAdjust(before));
  });
});

describe('TK-03.2 · ESC-34 (parcial, DP-02) ajuste de stock de un producto inactivo', () => {
  test('ESC-34 inactivo stock 5; ajuste a 0 con expectedStock 5 → 200 stock 0 e inactivo; repetirlo → 409 STOCK_CHANGED, stock 0 e inactivo (alertas: TK-04.1)', async () => {
    const id = await insertProduct(db, { ...STOCK_BASE, currentStock: 5, minStockAlert: 2, isActive: false });
    const before = await productRowOrThrow(db, id);

    const first = await adjustProductStock(id, { newStock: 0, expectedStock: 5 });
    expect(first.status).toBe(200);
    const afterFirst = await productRowOrThrow(db, id);
    expectProductMatchesRow(first.body, afterFirst);
    expect(first.body).toMatchObject({ currentStock: 0, isActive: false });
    expect(untouchedByAdjust(afterFirst)).toEqual(untouchedByAdjust(before));

    const second = await adjustProductStock(id, { newStock: 0, expectedStock: 5 });
    expectErrorResponse(second, 409, 'STOCK_CHANGED');
    const afterSecond = await productRowOrThrow(db, id);
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond).toMatchObject({ current_stock: 0, is_active: false });
  });
});

describe('TK-03.2 · ESC-16 y contrato AdjustStockRequest: validación estricta sin cambiar el stock', () => {
  const INVALID: [string, unknown][] = [
    // Casos literales de ESC-16 (IN-02, RN-01).
    ['newStock −1', { newStock: -1, expectedStock: 10 }],
    ['newStock 2.5 (no entero)', { newStock: 2.5, expectedStock: 10 }],
    ['sin expectedStock', { newStock: 25 }],
    // Resto del esquema AdjustStockRequest (RNF-02): enteros 0..2147483647, ambos requeridos, additionalProperties: false.
    ['newStock como texto "5"', { newStock: '5', expectedStock: 10 }],
    ['newStock null', { newStock: null, expectedStock: 10 }],
    ['newStock 2147483648 (> int32)', { newStock: 2147483648, expectedStock: 10 }],
    ['expectedStock −1', { newStock: 25, expectedStock: -1 }],
    ['expectedStock 1.5 (no entero)', { newStock: 25, expectedStock: 1.5 }],
    ['expectedStock 2147483648 (> int32)', { newStock: 25, expectedStock: 2147483648 }],
    ['expectedStock como texto "10"', { newStock: 25, expectedStock: '10' }],
    ['expectedStock null', { newStock: 25, expectedStock: null }],
    ['sin newStock', { expectedStock: 10 }],
    ['cuerpo vacío {}', {}],
    ['campo no permitido currentStock', { newStock: 25, expectedStock: 10, currentStock: 25 }],
    ['campo no permitido price', { newStock: 25, expectedStock: 10, price: '1.00' }],
    ['campo no permitido isActive', { newStock: 25, expectedStock: 10, isActive: false }],
    ['campo desconocido', { newStock: 25, expectedStock: 10, motivo: 'inventario' }],
    ['cuerpo arreglo', [{ newStock: 25, expectedStock: 10 }]],
    ['cuerpo null', null],
    ['cuerpo cadena JSON', 'ajuste'],
  ];

  test.each(INVALID)('ESC-16 adjustProductStock con %s → 422 VALIDATION_ERROR y la fila no cambia (stock 10)', async (_label, body) => {
    const id = await insertProduct(db, STOCK_BASE);
    const before = await productRowOrThrow(db, id);
    const res = await adjustProductStock(id, body);
    expectValidationError(res);
    const after = await productRowOrThrow(db, id);
    expect(after).toEqual(before);
    expect(after.current_stock).toBe(10);
  });

  test.each(['{"newStock": 25, "expectedStock": ', 'no es json', '{newStock: 25}'])(
    'contrato: adjustProductStock con cuerpo que no es JSON válido (%s) → 400 MALFORMED_REQUEST y la fila no cambia',
    async (raw) => {
      const id = await insertProduct(db, STOCK_BASE);
      const before = await productRowOrThrow(db, id);
      const res = await request(app).patch(stockPath(id)).set('Authorization', auth()).set('Content-Type', 'application/json').send(raw);
      expectErrorResponse(res, 400, 'MALFORMED_REQUEST');
      expect(await productRowOrThrow(db, id)).toEqual(before);
    },
  );
});
