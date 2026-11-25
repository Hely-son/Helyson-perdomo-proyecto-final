import bcrypt from 'bcryptjs';
import type { Client } from 'pg';
import { createPrismaClient } from '../../src/lib/prisma';
import { identifyCustomerByPhone, normalizePhone } from '../../src/modules/customers/customers.service';
import { DEFAULT_SEED_FIXTURES, type SeedFixtures } from '../../src/seed/fixtures';
import { runSeed, SeedConflictError } from '../../src/seed/seed';
import { connectTestDatabase, deriveTestDatabaseUrl, TEST_DATABASE_NAME } from './helpers/test-database';

// TK-00.4 · runSeed contra PostgreSQL real (medsupply_test). La limpieza global vacía la base antes de cada test.
// Spec 01 "Seed"; spec 05 §7.3 (casos A–D, DP-04), §15.3 (DP-08); ESC-14, ESC-15, ESC-16, ESC-18, ESC-22, ESC-32.
// Escenarios: docs/qa/TK-00.4-scenarios.md (QA-00.4-12..28).

type Db = ReturnType<typeof createPrismaClient>;
let db: Db;
let pg: Client;

const FX = DEFAULT_SEED_FIXTURES;
const OPERATOR = { email: 'operador.qa@example.test', password: 'Seed-Pass-Ficticia-QA-91', name: 'Operador QA' };
const TABLES = ['users', 'customers', 'products', 'orders', 'order_items'] as const;
type Table = (typeof TABLES)[number];

beforeAll(async () => {
  db = createPrismaClient(deriveTestDatabaseUrl());
  const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (rows[0]?.name !== TEST_DATABASE_NAME) {
    await db.$disconnect();
    throw new Error(`Operación abortada: la base conectada no es ${TEST_DATABASE_NAME}`);
  }
  pg = await connectTestDatabase();
});
afterAll(async () => {
  await db?.$disconnect();
  await pg?.end();
});

// ---- utilidades ----

function capture(): { lines: string[]; log: (message: string) => void } {
  const lines: string[] = [];
  return { lines, log: (message: string) => void lines.push(message) };
}

async function seed(fixtures: SeedFixtures = FX, operator = OPERATOR) {
  const { lines, log } = capture();
  await runSeed(db, operator, fixtures, log);
  return lines;
}

async function seedRejects(fixtures: SeedFixtures = FX): Promise<{ err: unknown; lines: string[] }> {
  const { lines, log } = capture();
  try {
    await runSeed(db, OPERATOR, fixtures, log);
  } catch (err) {
    return { err, lines };
  }
  throw new Error('se esperaba que runSeed rechazara');
}

async function count(table: Table): Promise<number> {
  const { rows } = await pg.query(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n as number;
}

async function counts(): Promise<Record<Table, number>> {
  const out = {} as Record<Table, number>;
  for (const t of TABLES) out[t] = await count(t);
  return out;
}

/** Huella de la tabla: n.º de filas y md5 de todas las columnas (incluido updated_at), ordenadas por id. */
async function digest(table: Table): Promise<string> {
  const { rows } = await pg.query(
    `SELECT count(*)::int AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) AS h FROM ${table} t`,
  );
  return `${rows[0].n}:${rows[0].h}`;
}

async function snapshot(): Promise<Record<Table, string>> {
  const out = {} as Record<Table, string>;
  for (const t of TABLES) out[t] = await digest(t);
  return out;
}

function normalized(raw: string): string {
  const r = normalizePhone(raw);
  if (!r.ok) throw new Error('fixture con teléfono inválido');
  return r.phone;
}

const fixturePhones = (): string[] => FX.customers.flatMap((c) => [c.phone, normalized(c.phone)]);

/** Comprueba que un texto visible (log o error) no contiene contraseña, hash, teléfonos ni la URL de la base. */
function expectNoSecrets(text: string, extra: string[] = []): void {
  const url = new URL(deriveTestDatabaseUrl());
  const secrets = [OPERATOR.password, url.toString(), ...fixturePhones(), ...extra];
  if (url.password.length >= 3) secrets.push(decodeURIComponent(url.password));
  for (const s of secrets) expect({ leaked: text.includes(s), s }).toEqual({ leaked: false, s });
}

function cents(amount: string): number {
  const [int, dec = ''] = amount.split('.');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

const productTuple = (p: { name: string; price: { toFixed(n: number): string } | string; currentStock: number; minStockAlert: number; isActive: boolean }) =>
  `${p.name}|${cents(typeof p.price === 'string' ? p.price : p.price.toFixed(2))}|${p.currentStock}|${p.minStockAlert}|${p.isActive}`;

const fixtureProduct = (key: string) => {
  const p = FX.products.find((x) => x.key === key);
  if (p === undefined) throw new Error(`producto de fixture inexistente: ${key}`);
  return p;
};

/** Inserta un cliente del fixture tal como lo dejaría el seed (caso D). */
const insertFixtureCustomer = (i: number) =>
  db.customer.create({
    data: { businessName: FX.customers[i].businessName, taxId: FX.customers[i].taxId, phone: normalized(FX.customers[i].phone), isActive: FX.customers[i].isActive },
  });

/** Un teléfono normalizado que no usa ningún fixture. */
function unusedPhone(): string {
  const used = new Set(FX.customers.map((c) => normalized(c.phone)));
  for (let n = 900000017; ; n += 1) {
    const candidate = `+56${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

const totalItems = FX.orders.reduce((acc, o) => acc + o.items.length, 0);
const CONFLICT_INDEX = 2; // 3.er cliente: los dos primeros ya se insertaron cuando aparece el conflicto

// ---- escenarios ----

describe('TK-00.4 · runSeed: primera ejecución sobre base vacía', () => {
  test('QA-00.4-12 spec 01 "Seed" conteos 1/4/10/5 y operador con hash bcrypt de costo 10 (ESC-32, QA-00.6-D11, D13)', async () => {
    await seed();
    expect(await counts()).toEqual({ users: 1, customers: 4, products: 10, orders: 5, order_items: totalItems });

    const user = await db.user.findUniqueOrThrow({ where: { email: OPERATOR.email } });
    expect(user.name).toBe(OPERATOR.name);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(user.passwordHash).not.toContain(OPERATOR.password);
    await expect(bcrypt.compare(OPERATOR.password, user.passwordHash)).resolves.toBe(true);
  });

  test('QA-00.4-13 spec 01 User.email el email se guarda en minúsculas y no se duplica al repetir con mayúsculas', async () => {
    const mixed = { ...OPERATOR, email: 'Operador.QA@Example.TEST' };
    await seed(FX, mixed);
    const users = await db.user.findMany();
    expect(users.map((u) => u.email)).toEqual(['operador.qa@example.test']);
    const before = await digest('users');
    await seed(FX, mixed);
    expect(await digest('users')).toBe(before);
  });

  test('QA-00.4-14 ESC-14 ESC-18 caso D: teléfono normalizado con normalizePhone e identificable en ambos formatos', async () => {
    await seed();
    for (const c of FX.customers) {
      const row = await db.customer.findUniqueOrThrow({ where: { taxId: c.taxId } });
      expect(row.phone).toBe(normalized(c.phone));
      expect(row.phone).toMatch(/^\+56\d{9}$/);
      expect(row.isActive).toBe(c.isActive);
      expect(row.businessName).toBe(c.businessName);
      for (const input of [c.phone, row.phone]) {
        const r = await identifyCustomerByPhone(db, input);
        if (c.isActive) {
          expect(r.status).toBe('active');
          if (r.status === 'active') expect(r.customer.taxId).toBe(c.taxId);
        } else {
          expect(r).toEqual({ status: 'inactive' });
        }
      }
    }
  });

  test('QA-00.4-15 QA-00.6-D17 productos iguales a los fixtures y stock sin descontar por los pedidos', async () => {
    await seed();
    const rows = await db.product.findMany();
    expect(rows.map(productTuple).sort()).toEqual(FX.products.map(productTuple).sort());
  });

  test('QA-00.4-16 RN-04 RN-05 un pedido por estado, MED-\\d{5,}, cliente por tax_id, ítems y total del fixture', async () => {
    await seed();
    const rows = await db.order.findMany({ include: { customer: true, items: { include: { product: true } } } });
    expect(rows).toHaveLength(FX.orders.length);
    for (const f of FX.orders) {
      const matching = rows.filter((o) => o.status === f.status);
      expect({ status: f.status, n: matching.length }).toEqual({ status: f.status, n: 1 });
      const o = matching[0];
      expect(o.orderNumber).toMatch(/^MED-\d{5,}$/);
      expect(o.customer.taxId).toBe(f.customerTaxId);

      const expectedItems = f.items.map((i) => `${productTuple(fixtureProduct(i.productKey))}|${i.quantity}|${cents(i.unitPrice)}`).sort();
      const actualItems = o.items.map((i) => `${productTuple(i.product)}|${i.quantity}|${cents(i.unitPrice.toFixed(2))}`).sort();
      expect(actualItems).toEqual(expectedItems);

      const expectedTotal = f.items.reduce((acc, i) => acc + i.quantity * cents(i.unitPrice), 0);
      expect(cents(o.totalAmount.toFixed(2))).toBe(expectedTotal);
    }
  });
});

describe('TK-00.4 · runSeed: idempotencia y registros existentes', () => {
  test('QA-00.4-17 ESC-15 QA-00.6-D14 segunda ejecución: ninguna tabla cambia (md5 con updated_at)', async () => {
    await seed();
    const before = await snapshot();
    await expect(seed()).resolves.toBeDefined();
    expect(await snapshot()).toEqual(before);
  });

  test('QA-00.4-18 N2 operador existente: no cambia aunque el entorno traiga otro nombre y otra contraseña', async () => {
    const original = 'Original-Pass-Ficticia-QA';
    await db.user.create({ data: { email: OPERATOR.email, passwordHash: await bcrypt.hash(original, 10), name: 'Nombre Original QA' } });
    const before = await digest('users');
    await seed(FX, { ...OPERATOR, name: 'Otro Nombre QA' });
    expect(await digest('users')).toBe(before);
    const user = await db.user.findUniqueOrThrow({ where: { email: OPERATOR.email } });
    await expect(bcrypt.compare(original, user.passwordHash)).resolves.toBe(true);
    await expect(bcrypt.compare(OPERATOR.password, user.passwordHash)).resolves.toBe(false);
  });

  test('QA-00.4-19 §7.3 caso A parcial: los clientes ya cargados se reconocen sin cambios y se completa la carga', async () => {
    const existing = [await insertFixtureCustomer(0), await insertFixtureCustomer(1)];
    await seed();
    for (const e of existing) {
      expect(await db.customer.findUniqueOrThrow({ where: { id: e.id } })).toEqual(e);
    }
    expect(await counts()).toEqual({ users: 1, customers: 4, products: 10, orders: 5, order_items: totalItems });
  });
});

describe('TK-00.4 · runSeed: conflictos de clientes (spec 05 §7.3, N4)', () => {
  test('QA-00.4-20 ESC-22 caso B: mismo tax_id con otro teléfono → SeedConflictError, sin sobrescribir y sin productos ni pedidos', async () => {
    const target = FX.customers[CONFLICT_INDEX];
    const otherPhone = unusedPhone();
    const existing = await db.customer.create({ data: { businessName: 'Registro previo QA', taxId: target.taxId, phone: otherPhone, isActive: true } });

    const { err, lines } = await seedRejects();
    expect(err).toBeInstanceOf(SeedConflictError);
    const conflict = err as SeedConflictError;
    expect(conflict.taxId).toBe(target.taxId);
    expect(conflict.message).toContain(target.taxId);
    expectNoSecrets(`${conflict.message}\n${lines.join('\n')}`, [otherPhone]);

    expect(await db.customer.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing);
    expect(await db.customer.count({ where: { taxId: target.taxId } })).toBe(1);
    for (let i = 0; i < CONFLICT_INDEX; i += 1) {
      expect(await db.customer.count({ where: { taxId: FX.customers[i].taxId } })).toBe(1);
    }
    for (let i = CONFLICT_INDEX + 1; i < FX.customers.length; i += 1) {
      expect(await db.customer.count({ where: { taxId: FX.customers[i].taxId } })).toBe(0);
    }
    expect(await count('products')).toBe(0);
    expect(await count('orders')).toBe(0);
    expect(await count('order_items')).toBe(0);
  });

  test('QA-00.4-21 ESC-16 caso C: teléfono usado por otro tax_id → SeedConflictError, sin duplicado y sin productos ni pedidos', async () => {
    const target = FX.customers[CONFLICT_INDEX];
    const phone = normalized(target.phone);
    const existing = await db.customer.create({ data: { businessName: 'Cliente ajeno QA', taxId: 'QA-AJENO-1', phone, isActive: true } });

    const { err, lines } = await seedRejects();
    expect(err).toBeInstanceOf(SeedConflictError);
    const conflict = err as SeedConflictError;
    expect(conflict.taxId).toBe(target.taxId);
    expect(conflict.message).toContain(target.taxId);
    expectNoSecrets(`${conflict.message}\n${lines.join('\n')}`);

    expect(await db.customer.findUniqueOrThrow({ where: { id: existing.id } })).toEqual(existing);
    expect(await db.customer.count({ where: { taxId: target.taxId } })).toBe(0);
    expect(await db.customer.count({ where: { phone } })).toBe(1);
    for (let i = 0; i < CONFLICT_INDEX; i += 1) {
      expect(await db.customer.count({ where: { taxId: FX.customers[i].taxId } })).toBe(1);
    }
    expect(await count('products')).toBe(0);
    expect(await count('orders')).toBe(0);
    expect(await count('order_items')).toBe(0);
  });

  test('QA-00.4-22 §7.3 tras corregir el conflicto, la siguiente ejecución reconoce lo insertado (caso A) y completa la carga', async () => {
    const target = FX.customers[CONFLICT_INDEX];
    await db.customer.create({ data: { businessName: 'Cliente ajeno QA', taxId: 'QA-AJENO-1', phone: normalized(target.phone), isActive: true } });
    await seedRejects();
    const kept = await db.customer.findMany({ where: { taxId: { in: FX.customers.slice(0, CONFLICT_INDEX).map((c) => c.taxId) } } });
    expect(kept).toHaveLength(CONFLICT_INDEX);

    await pg.query("DELETE FROM customers WHERE tax_id = 'QA-AJENO-1'");
    await seed();
    for (const k of kept) expect(await db.customer.findUniqueOrThrow({ where: { id: k.id } })).toEqual(k);
    expect(await counts()).toEqual({ users: 1, customers: 4, products: 10, orders: 5, order_items: totalItems });
  });
});

describe('TK-00.4 · runSeed: productos y pedidos por tabla', () => {
  test('QA-00.4-23 productos preexistentes: quedan intactos, los pedidos se omiten con mensaje y el resto se carga', async () => {
    await db.product.create({ data: { name: 'Producto previo QA', price: '1.00', currentStock: 5, minStockAlert: 1 } });
    const before = await digest('products');
    const lines = await seed();
    expect(await digest('products')).toBe(before);
    expect(await count('orders')).toBe(0);
    expect(await count('order_items')).toBe(0);
    expect(await count('customers')).toBe(4);
    expect(await count('users')).toBe(1);
    expect(lines.some((l) => /pedido/i.test(l) && /producto/i.test(l))).toBe(true);
  });

  test('QA-00.4-24 pedidos preexistentes: los productos se cargan y pedidos e ítems quedan intactos', async () => {
    const customer = await db.customer.create({ data: { businessName: 'Cliente previo QA', taxId: 'QA-PREVIO-1', phone: unusedPhone(), isActive: true } });
    await db.order.create({ data: { customerId: customer.id, status: 'PENDING', totalAmount: '10.00' } });
    const orders = await digest('orders');
    const items = await digest('order_items');
    await seed();
    expect(await count('products')).toBe(10);
    expect(await digest('orders')).toBe(orders);
    expect(await digest('order_items')).toBe(items);
    expect(await count('customers')).toBe(5);
  });

  test('QA-00.4-25 QA-00.6-D16(a) fallo de BD en el último pedido: se revierte la transacción, 0 pedidos y 0 ítems', async () => {
    const last = FX.orders.length - 1;
    const broken: SeedFixtures = {
      ...FX,
      orders: FX.orders.map((o, i) => (i === last ? { ...o, items: o.items.map((it, j) => (j === 0 ? { ...it, quantity: 0 } : it)) } : o)),
    };
    await seedRejects(broken);
    expect(await count('orders')).toBe(0);
    expect(await count('order_items')).toBe(0);
  });

  test('QA-00.4-25 TK-00.4 tax_id de pedido sin resolver: 0 pedidos y 0 ítems', async () => {
    const last = FX.orders.length - 1;
    const broken: SeedFixtures = { ...FX, orders: FX.orders.map((o, i) => (i === last ? { ...o, customerTaxId: 'QA-NO-EXISTE' } : o)) };
    await seedRejects(broken);
    expect(await count('orders')).toBe(0);
    expect(await count('order_items')).toBe(0);
  });

  test('QA-00.4-26 fallo de BD en el último producto: 0 productos y 0 pedidos', async () => {
    const last = FX.products.length - 1;
    const broken: SeedFixtures = { ...FX, products: FX.products.map((p, i) => (i === last ? { ...p, currentStock: -1 } : p)) };
    await seedRejects(broken);
    expect(await count('products')).toBe(0);
    expect(await count('orders')).toBe(0);
    expect(await count('order_items')).toBe(0);
  });

  test('QA-00.4-27 §7.3 regla 2 fixture con teléfono que no normaliza: el seed falla y ese cliente no se inserta', async () => {
    const broken: SeedFixtures = { ...FX, customers: FX.customers.map((c, i) => (i === 0 ? { ...c, phone: 'abc' } : c)) };
    await seedRejects(broken);
    expect(await db.customer.count({ where: { taxId: FX.customers[0].taxId } })).toBe(0);
  });
});

describe('TK-00.4 · runSeed: higiene de logs (RNF-08, DP-08)', () => {
  test('QA-00.4-28 ni la primera ejecución, ni la repetición, ni la omisión de pedidos registran contraseña, hash, teléfonos o URL', async () => {
    const first = await seed();
    const hash = (await db.user.findUniqueOrThrow({ where: { email: OPERATOR.email } })).passwordHash;
    const second = await seed();
    expect(first.length).toBeGreaterThan(0);
    expectNoSecrets([...first, ...second].join('\n'), [hash]);

    // Pedidos vacíos y productos no vacíos: la tercera ejecución omite los pedidos con su mensaje.
    await pg.query('DELETE FROM order_items');
    await pg.query('DELETE FROM orders');
    const skipped = await seed();
    expectNoSecrets(skipped.join('\n'), [hash]);
  });
});
