import { createProductService, type ProductDb, type ProductRecord } from '../../../src/modules/products/products.service';

// TK-05.2 · Pruebas de aceptación de QA (fase 1): capacidades de products.service para el chat (unidad, sin base de datos).
// Spec 02 F-7 y §8.2 (catálogo del chat y disponibilidad, sin endpoint propio), RN-10, RN-02 (sin reserva), CH-04, CH-05;
// filas ESC-06, ESC-17 y ESC-32 de la spec 02 (parte del chat) y DP-01 de la spec 03. Los nombres los fija la implementación (spec 02 §8.2):
// SUPUESTO DE INTERFAZ de QA (el backend lo adopta o lo ajusta):
//   service.listCatalog(): Promise<{ items: { id; name; price: string ("1500.00"); currentStock }[] }>
//     productos ACTIVOS (stock 0 incluido, inactivos excluidos), orden por nombre y luego id; solo esos cuatro campos.
//   service.getAvailability(id): Promise<{ id; name; isActive; currentStock } | null>   (null si el producto no existe)
//     estado y stock ACTUALES del producto, también si está inactivo; sin caché; solo lectura.
// Base simulada en memoria (fidelidad mínima: where.isActive, orderBy name/id, findUnique/findFirst); la prueba contra
// PostgreSQL real está en tests/db/chat-catalog-cart.test.ts (ESC-17, ESC-06, ESC-32).
// Matriz: docs/qa/TK-05.2-matrix.md

interface ChatCapabilities {
  listCatalog(): Promise<{ items: Record<string, unknown>[] }>;
  getAvailability(id: number): Promise<Record<string, unknown> | null>;
}

interface Row {
  id: number;
  name: string;
  description: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
  isActive: boolean;
}

const NOW = new Date('2026-03-01T12:00:00.000Z');
const row = (p: Partial<Row> & Pick<Row, 'id' | 'name'>): Row => ({
  description: 'Descripción QA',
  price: '1500.00',
  currentStock: 10,
  minStockAlert: 3,
  isActive: true,
  ...p,
});

function makeDb(rows: Row[]) {
  const writes: string[] = [];
  const record = (r: Row): ProductRecord =>
    ({ ...r, price: { toFixed: (d: number) => Number(r.price).toFixed(d) }, createdAt: NOW, updatedAt: NOW }) as unknown as ProductRecord;
  const forbidden = (name: string) => () => {
    writes.push(name);
    throw new Error(`escritura no permitida: ${name}`);
  };
  const db = {
    product: {
      fields: { minStockAlert: { modelName: 'Product', name: 'minStockAlert', typeName: 'Int', isList: false } },
      async findMany(args: { where?: { isActive?: boolean; currentStock?: { lte: unknown } }; orderBy?: unknown } = {}) {
        let out = [...rows];
        if (args.where?.isActive !== undefined) out = out.filter((r) => r.isActive === args.where!.isActive);
        if (args.where?.currentStock?.lte !== undefined) out = out.filter((r) => r.currentStock <= r.minStockAlert);
        out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id));
        return out.map(record);
      },
      async findUnique(args: { where: { id: number } }) {
        const found = rows.find((r) => r.id === args.where.id);
        return found ? record(found) : null;
      },
      async findFirst(args: { where?: { id?: number } } = {}) {
        const found = rows.find((r) => args.where?.id === undefined || r.id === args.where.id);
        return found ? record(found) : null;
      },
      create: forbidden('create'),
      update: forbidden('update'),
      updateMany: forbidden('updateMany'),
    },
  };
  return { db: db as unknown as ProductDb, writes };
}

const build = (rows: Row[]) => {
  const { db, writes } = makeDb(rows);
  const service = createProductService({ prisma: db }) as unknown as ChatCapabilities;
  return { service, writes };
};

describe('TK-05.2 · products.service · catálogo del chat (spec 02 F-7, CH-04, RN-10)', () => {
  const rows = [
    row({ id: 3, name: 'Mascarilla N95', price: '800.00', currentStock: 0 }), // B: activo, sin stock
    row({ id: 1, name: 'Guantes de nitrilo', price: '1500.00', currentStock: 10 }), // A
    row({ id: 2, name: 'Jeringa 5 ml', price: '300.00', currentStock: 5, isActive: false }), // C: inactivo
  ];

  test('ESC-17 · devuelve los productos activos con precio y stock (el de stock 0 incluido) y no devuelve el inactivo', async () => {
    const { service } = build(rows);
    const { items } = await service.listCatalog();
    expect(items.map((i) => i.id)).toEqual([1, 3]);
    expect(items[0]).toEqual({ id: 1, name: 'Guantes de nitrilo', price: '1500.00', currentStock: 10 });
    expect(items[1]).toEqual({ id: 3, name: 'Mascarilla N95', price: '800.00', currentStock: 0 });
  });

  test('ESC-06 / ESC-32 · un producto inactivo no aparece aunque su stock quede ≤ mínimo o se haya editado (nombre, precio, mínimo)', async () => {
    const { service } = build([
      row({ id: 1, name: 'Activo', currentStock: 2, minStockAlert: 5 }),
      row({ id: 2, name: 'Inactivo editado', price: '999.00', currentStock: 1, minStockAlert: 50, isActive: false }),
    ]);
    const { items } = await service.listCatalog();
    expect(items.map((i) => i.id)).toEqual([1]);
  });

  test('el catálogo se ordena por nombre y luego por id', async () => {
    const { service } = build([
      row({ id: 9, name: 'Bata' }),
      row({ id: 4, name: 'Alcohol' }),
      row({ id: 2, name: 'Bata' }),
    ]);
    const { items } = await service.listCatalog();
    expect(items.map((i) => i.id)).toEqual([4, 2, 9]);
  });

  test('expone solo id, name, price y currentStock (no el stock mínimo, la descripción ni las fechas)', async () => {
    const { service } = build(rows);
    const { items } = await service.listCatalog();
    for (const item of items) expect(Object.keys(item).sort()).toEqual(['currentStock', 'id', 'name', 'price']);
  });

  test('RN-02 · solo lee: listCatalog y getAvailability no crean, no actualizan ni reservan stock', async () => {
    const { service, writes } = build(rows);
    await service.listCatalog();
    await service.getAvailability(1);
    expect(writes).toEqual([]);
  });
});

describe('TK-05.2 · products.service · disponibilidad (spec 02 F-7 y §8.2, CH-05, DP-01, RN-02)', () => {
  test('producto activo con stock: informa activo y su stock actual', async () => {
    const { service } = build([row({ id: 1, name: 'Guantes de nitrilo', currentStock: 10 })]);
    await expect(service.getAvailability(1)).resolves.toMatchObject({ id: 1, name: 'Guantes de nitrilo', isActive: true, currentStock: 10 });
  });

  test('DP-01 · producto inactivo: informa isActive false (y el stock que tiene)', async () => {
    const { service } = build([row({ id: 1, name: 'Desactivado', currentStock: 5, isActive: false })]);
    await expect(service.getAvailability(1)).resolves.toMatchObject({ id: 1, isActive: false, currentStock: 5 });
  });

  test('producto inexistente: devuelve null (el chat lo trata como no disponible)', async () => {
    const { service } = build([row({ id: 1, name: 'Uno' })]);
    await expect(service.getAvailability(999)).resolves.toBeNull();
  });

  test('refleja el estado actual en cada consulta (sin caché): un cambio de stock o de estado se ve en la siguiente llamada', async () => {
    const data = [row({ id: 1, name: 'Cambiante', currentStock: 10 })];
    const { service } = build(data);
    await expect(service.getAvailability(1)).resolves.toMatchObject({ isActive: true, currentStock: 10 });
    data[0].currentStock = 2;
    await expect(service.getAvailability(1)).resolves.toMatchObject({ currentStock: 2 });
    data[0].isActive = false;
    await expect(service.getAvailability(1)).resolves.toMatchObject({ isActive: false });
  });

});
