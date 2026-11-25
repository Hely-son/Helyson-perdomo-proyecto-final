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
  insertProduct,
  type ProductFixture,
  PRODUCTS,
  productRowOrThrow,
} from './helpers/products';

// Pruebas de aceptación de TK-04.1 · consulta de alertas de stock (listStockAlerts) contra PostgreSQL real
// (medsupply_test, RNF-01). Spec 02 F-6, §5.1 (RN-09), §5.3, §10.9, §11.3 y filas ESC-05, 06, 17, 32, 34;
// spec 05 ESC-29; contrato docs/openapi.yaml GET /products/alerts (200 ProductList, 401) (RNF-02).
// Criterios A1..A15 aprobados en la puerta 1. Matriz: docs/qa/TK-04.1-matrix.md.
// Solo la parte de alertas de ESC-06, 17, 32 y 34: el resto ya lo verifica products-api.test.ts.
// Autenticación: solo la evidencia que falta (otro secreto, expirado y variantes O-3 sobre /alerts); "sin token"
// sobre /alerts lo cubre auth-guard.test.ts (ESC-27). La regresión (A15) reutiliza las suites existentes.
// Los productos se insertan como fixtures Prisma; las transiciones (editar, desactivar, ajustar) van por HTTP.
// La limpieza global vacía la base antes de cada test. Secretos y datos ficticios; ningún test imprime tokens.

let db: Db;
let app: Express;

beforeAll(async () => {
  db = await connectTestPrisma();
  app = buildProductsApp(db);
});
afterAll(async () => {
  await db?.$disconnect();
});

const ALERTS = `${PRODUCTS}/alerts`;
const auth = () => `Bearer ${validTestToken('1')}`;
const byId = (id: number) => `${PRODUCTS}/${id}`;

const listStockAlerts = () => request(app).get(ALERTS).set('Authorization', auth());
const updateProduct = (id: number, body: unknown) =>
  request(app).patch(byId(id)).set('Authorization', auth()).set('Content-Type', 'application/json').send(JSON.stringify(body));
const deactivateProduct = (id: number) => request(app).post(`${byId(id)}/deactivate`).set('Authorization', auth());
const adjustProductStock = (id: number, body: unknown) =>
  request(app).patch(`${byId(id)}/stock`).set('Authorization', auth()).set('Content-Type', 'application/json').send(JSON.stringify(body));

/** Exige 200 JSON conforme a ProductList y devuelve los ítems. */
function alertItems(res: Response): Record<string, unknown>[] {
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  return expectProductListShape(res.body);
}

async function alertIds(): Promise<number[]> {
  return alertItems(await listStockAlerts()).map((p) => p.id as number);
}

/** Producto activo en alerta que debe aparecer siempre: evita que una lista vacía pase por casualidad. */
async function insertControl(): Promise<number> {
  return insertProduct(db, { name: 'Control en alerta', currentStock: 1, minStockAlert: 1, isActive: true });
}

/** Fila de products con xmin: cualquier UPDATE (aunque no cambie valores) crea una versión nueva de la fila. */
async function rowVersions(): Promise<{ id: number; xmin: string }[]> {
  return db.$queryRaw<{ id: number; xmin: string }[]>`SELECT id, xmin::text AS xmin FROM products ORDER BY id`;
}

// ---------------------------------------------------------------------------------------------
// A1..A6 · ESC-19 / CA-01 / RN-09: quién aparece, orden y forma
// ---------------------------------------------------------------------------------------------

describe('TK-04.1 · ESC-19 / CA-01 / RN-09 listStockAlerts devuelve solo los activos con stock ≤ mínimo', () => {
  test('ESC-19 activos (3,3), (2,3), (4,3) e inactivo (1,3) → aparecen solo (3,3) y (2,3), por nombre, con stock y mínimo', async () => {
    // Insertados en orden distinto al alfabético para que el orden por id no coincida con el esperado.
    const igual = await insertProduct(db, { name: 'Mascarillas', currentStock: 3, minStockAlert: 3, isActive: true });
    await insertProduct(db, { name: 'Alcohol', currentStock: 4, minStockAlert: 3, isActive: true });
    const menor = await insertProduct(db, { name: 'Gasas', currentStock: 2, minStockAlert: 3, isActive: true });
    await insertProduct(db, { name: 'Bisturi', currentStock: 1, minStockAlert: 3, isActive: false });

    const items = alertItems(await listStockAlerts());
    expect(items.map((p) => [p.name, p.currentStock, p.minStockAlert])).toEqual([
      ['Gasas', 2, 3],
      ['Mascarillas', 3, 3],
    ]);
    expect(items.map((p) => p.id)).toEqual([menor, igual]);
  });

  test('A1 · CA-01 activo con stock igual al mínimo aparece (incluido 0 = 0)', async () => {
    const tres = await insertProduct(db, { name: 'Apositos', currentStock: 3, minStockAlert: 3 });
    const cero = await insertProduct(db, { name: 'Bajalenguas', currentStock: 0, minStockAlert: 0 });
    expect(await alertIds()).toEqual([tres, cero]);
  });

  test('A2 · RN-09 activo con stock menor que el mínimo aparece (incluido stock 0)', async () => {
    const dos = await insertProduct(db, { name: 'Catéter', currentStock: 2, minStockAlert: 3 });
    const cero = await insertProduct(db, { name: 'Electrodos', currentStock: 0, minStockAlert: 3 });
    expect(await alertIds()).toEqual([dos, cero]);
  });

  test('A3 · RN-09 activo con stock mayor que el mínimo no aparece (4 > 3 y 1 > 0)', async () => {
    const control = await insertControl();
    await insertProduct(db, { name: 'Algodón', currentStock: 4, minStockAlert: 3 });
    await insertProduct(db, { name: 'Venda', currentStock: 1, minStockAlert: 0 });
    expect(await alertIds()).toEqual([control]);
  });

  test('A4 · CA-01 inactivo con stock ≤ mínimo no aparece (=, < y 0 = 0)', async () => {
    const control = await insertControl();
    await insertProduct(db, { name: 'Inactivo igual', currentStock: 3, minStockAlert: 3, isActive: false });
    await insertProduct(db, { name: 'Inactivo menor', currentStock: 1, minStockAlert: 3, isActive: false });
    await insertProduct(db, { name: 'Inactivo cero', currentStock: 0, minStockAlert: 0, isActive: false });
    expect(await alertIds()).toEqual([control]);
  });

  test('A5 · contrato: ítems ordenados por nombre ascendente, cada uno Product igual a su fila (currentStock y minStockAlert incluidos)', async () => {
    const fixtures: ProductFixture[] = [
      { name: 'Termometro', currentStock: 1, minStockAlert: 5, price: '15.90', description: null },
      { name: 'Alcohol gel', currentStock: 5, minStockAlert: 5, price: '100.50' },
      { name: 'Jeringa 5 ml', currentStock: 0, minStockAlert: 2, price: '3.10' },
      { name: 'Guantes', currentStock: 7, minStockAlert: 10, price: '1250.00' },
      { name: 'Fuera de alerta', currentStock: 50, minStockAlert: 10 },
    ];
    for (const f of fixtures) await insertProduct(db, f);

    const items = alertItems(await listStockAlerts());
    expect(items.map((p) => p.name)).toEqual(['Alcohol gel', 'Guantes', 'Jeringa 5 ml', 'Termometro']);
    for (const item of items) expectProductMatchesRow(item, await productRowOrThrow(db, item.id as number));
    expect(items.map((p) => [p.currentStock, p.minStockAlert])).toEqual([
      [5, 5],
      [7, 10],
      [0, 2],
      [1, 5],
    ]);
  });

  test('A6 · sin productos → 200 { items: [] }', async () => {
    const res = await listStockAlerts();
    alertItems(res);
    expect(res.body).toEqual({ items: [] });
  });

  test('A6 · solo productos fuera de alerta (activos con stock > mínimo e inactivos) → 200 { items: [] }', async () => {
    await insertProduct(db, { name: 'Activo holgado', currentStock: 10, minStockAlert: 3 });
    await insertProduct(db, { name: 'Inactivo en cero', currentStock: 0, minStockAlert: 3, isActive: false });
    const res = await listStockAlerts();
    alertItems(res);
    expect(res.body).toEqual({ items: [] });
  });
});

// ---------------------------------------------------------------------------------------------
// A7 · ESC-21 / IN-03 (MVP, solo consulta): la consulta no modifica nada
// ---------------------------------------------------------------------------------------------

describe('TK-04.1 · ESC-21 listStockAlerts es de solo lectura', () => {
  test('ESC-21 catálogo mixto: dos consultas seguidas no cambian ninguna fila (stock, mínimo, estado, updated_at) ni crean versiones nuevas (xmin)', async () => {
    await insertProduct(db, { name: 'Activo en alerta', currentStock: 2, minStockAlert: 3 });
    await insertProduct(db, { name: 'Activo igual', currentStock: 3, minStockAlert: 3 });
    await insertProduct(db, { name: 'Activo holgado', currentStock: 9, minStockAlert: 3 });
    await insertProduct(db, { name: 'Inactivo en alerta', currentStock: 0, minStockAlert: 3, isActive: false });
    const before = await allProductRows(db);
    const versionsBefore = await rowVersions();

    expect(alertItems(await listStockAlerts())).toHaveLength(2);
    expect(alertItems(await listStockAlerts())).toHaveLength(2);

    expect(await allProductRows(db)).toEqual(before);
    expect(await rowVersions()).toEqual(versionsBefore);
  });
});

// ---------------------------------------------------------------------------------------------
// A8..A12 · las alertas son derivadas (spec 02 §10.9): reflejan cada cambio en la siguiente consulta
// ---------------------------------------------------------------------------------------------

describe('TK-04.1 · ESC-05 / RN-09 cambiar el mínimo de un activo lo hace entrar y salir de alertas', () => {
  test('ESC-05 activo stock 5, mínimo 2 (fuera) → mínimo 5: aparece → mínimo 4: deja de aparecer', async () => {
    const id = await insertProduct(db, { name: 'Suero', currentStock: 5, minStockAlert: 2 });
    expect(await alertIds()).toEqual([]);

    expect((await updateProduct(id, { minStockAlert: 5 })).status).toBe(200);
    const items = alertItems(await listStockAlerts());
    expect(items.map((p) => [p.id, p.currentStock, p.minStockAlert])).toEqual([[id, 5, 5]]);

    expect((await updateProduct(id, { minStockAlert: 4 })).status).toBe(200);
    expect(await alertIds()).toEqual([]);
  });
});

describe('TK-04.1 · ESC-06 (parte de alertas) / RN-10 un producto desactivado sale de alertas', () => {
  test('ESC-06 activo stock 2, mínimo 5 aparece; tras deactivateProduct deja de aparecer (el resto de ESC-06: products-api.test.ts)', async () => {
    const control = await insertControl();
    const id = await insertProduct(db, { name: 'Jeringa 5 ml', currentStock: 2, minStockAlert: 5 });
    expect(await alertIds()).toEqual([control, id]);

    expect((await deactivateProduct(id)).status).toBe(200);
    expect(await alertIds()).toEqual([control]);
  });
});

describe('TK-04.1 · ESC-32 (parte de alertas) / DP-02 editar un inactivo no lo hace aparecer en alertas', () => {
  test.each([
    ['mínimo hasta dejar stock < mínimo', { minStockAlert: 5 }],
    ['todos los campos editables, con stock = mínimo', { name: 'Gasa', description: null, price: '9.99', minStockAlert: 2 }],
  ])('ESC-32 inactivo (stock 2, mínimo 1): updateProduct de %s → 200 y sigue fuera de alertas', async (_label, patch) => {
    const control = await insertControl();
    const id = await insertProduct(db, { name: 'Gasa', currentStock: 2, minStockAlert: 1, isActive: false });
    expect(await alertIds()).toEqual([control]);

    expect((await updateProduct(id, patch)).status).toBe(200);
    expect(await alertIds()).toEqual([control]);
  });
});

describe('TK-04.1 · ESC-17 (parte de alertas) / CA-01 un activo ajustado a 0 aparece en alertas', () => {
  test.each([3, 0])('ESC-17 activo stock 10, mínimo %i (fuera) → adjustProductStock a 0 con expectedStock 10 → aparece con stock 0', async (min) => {
    const id = await insertProduct(db, { name: 'Mascarilla N95', currentStock: 10, minStockAlert: min });
    expect(await alertIds()).toEqual([]);

    expect((await adjustProductStock(id, { newStock: 0, expectedStock: 10 })).status).toBe(200);
    const items = alertItems(await listStockAlerts());
    expect(items).toHaveLength(1);
    expectProductMatchesRow(items[0], await productRowOrThrow(db, id));
    expect(items[0]).toMatchObject({ id, currentStock: 0, minStockAlert: min, isActive: true });
  });
});

describe('TK-04.1 · ESC-34 (parte de alertas) / DP-02 un inactivo ajustado a 0 no aparece en alertas', () => {
  test('ESC-34 inactivo stock 5, mínimo 2: ajuste a 0 (200) y repetición (409) → sigue fuera de alertas (el resto de ESC-34: products-api.test.ts)', async () => {
    const control = await insertControl();
    const id = await insertProduct(db, { name: 'Sonda', currentStock: 5, minStockAlert: 2, isActive: false });

    expect((await adjustProductStock(id, { newStock: 0, expectedStock: 5 })).status).toBe(200);
    expect(await alertIds()).toEqual([control]);

    expect((await adjustProductStock(id, { newStock: 0, expectedStock: 5 })).status).toBe(409);
    expect(await alertIds()).toEqual([control]);
  });
});

// ---------------------------------------------------------------------------------------------
// A13 · ESC-29 (seguimiento TK-01.1) y condición S1 (TK-03.1): /alerts no se interpreta como productId
// ---------------------------------------------------------------------------------------------

describe('TK-04.1 · ESC-29 / S1 listStockAlerts con token válido', () => {
  test('ESC-29 / S1 GET /api/v1/products/alerts con token válido → 200 ProductList (no 422 VALIDATION_ERROR de getProduct)', async () => {
    const id = await insertProduct(db, { name: 'Gasas', currentStock: 1, minStockAlert: 2 });
    const res = await listStockAlerts();
    expect(res.status).not.toBe(422);
    expect(res.body?.error?.code).not.toBe('VALIDATION_ERROR');
    const items = alertItems(res);
    expect(items.map((p) => p.id)).toEqual([id]);
  });
});

// ---------------------------------------------------------------------------------------------
// A14 · ESC-10 y O-3 (TK-01.1) sobre /alerts: solo lo que no cubren auth-guard.test.ts ni products-api.test.ts
// ---------------------------------------------------------------------------------------------

describe('TK-04.1 · ESC-10 listStockAlerts sin sesión válida → 401 UNAUTHORIZED sin efectos', () => {
  const expired = () => {
    const iat = nowSeconds() - 7200;
    return signTestJwt({ sub: '1', iat, exp: iat + 3600 });
  };

  test.each([
    ['token firmado con otro secreto', () => `Bearer ${validTestToken('1', QA_OTHER_SECRET)}`],
    ['token expirado', () => `Bearer ${expired()}`],
  ])('ESC-10 GET /api/v1/products/alerts con %s → 401 UNAUTHORIZED y la base no cambia', async (_label, header) => {
    await insertProduct(db, { name: 'En alerta', currentStock: 0, minStockAlert: 3 });
    const before = await allProductRows(db);
    const res = await request(app).get(ALERTS).set('Authorization', header());
    expectErrorResponse(res, 401, 'UNAUTHORIZED');
    expect(await allProductRows(db)).toEqual(before);
  });
});

describe('TK-04.1 · O-3 (TK-01.1) variantes de la ruta de alertas sin token no quedan sin protección', () => {
  test.each(['/API/V1/PRODUCTS/ALERTS', '/api/v1/products/alerts/'])(
    'O-3: GET %s sin token → 401 UNAUTHORIZED y la base no cambia',
    async (url) => {
      await insertProduct(db, { name: 'En alerta', currentStock: 0, minStockAlert: 3 });
      const before = await allProductRows(db);
      expectErrorResponse(await request(app).get(url), 401, 'UNAUTHORIZED');
      expect(await allProductRows(db)).toEqual(before);
    },
  );
});
