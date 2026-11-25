import { createPrismaClient } from '../../src/lib/prisma';
import { identifyCustomerByPhone, type CustomerDb } from '../../src/modules/customers/customers.service';
import { deriveTestDatabaseUrl, TEST_DATABASE_NAME } from './helpers/test-database';

// TK-02.4 · CL-03 contra PostgreSQL real (medsupply_test). Spec 05 ESC-09..ESC-13, ESC-19, ESC-21; spec 03 ESC-06.
type Db = ReturnType<typeof createPrismaClient>;
let db: Db;

beforeAll(async () => {
  db = createPrismaClient(deriveTestDatabaseUrl());
  const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (rows[0]?.name !== TEST_DATABASE_NAME) {
    await db.$disconnect();
    throw new Error(`Operación abortada: la base conectada no es ${TEST_DATABASE_NAME}`);
  }
});
afterAll(async () => {
  await db.$disconnect();
});

const insert = (businessName: string, taxId: string, phone: string, isActive: boolean) =>
  db.customer.create({ data: { businessName, taxId, phone, isActive } });

/** F1..F4 guardados con el literal normalizado (la limpieza global vacía la base antes de cada test). */
async function fixtures() {
  const f1 = await insert('F1 nacional', '1-1', '+56912345678', true);
  const f2 = await insert('F2 con +56', '2-2', '+56949076876', true);
  const f3 = await insert('F3 otro prefijo', '3-3', '+5491112345678', true);
  const f4 = await insert('F4 inactivo', '4-4', '+56987654321', false);
  return { f1, f2, f3, f4 };
}

/** Envuelve el cliente real y espía findUnique. */
function spied(): { dbSpy: CustomerDb; findUnique: jest.Mock } {
  const findUnique = jest.fn((args: { where: { phone: string } }) => db.customer.findUnique(args));
  return { dbSpy: { customer: { findUnique } }, findUnique };
}

describe('TK-02.4 · identifyCustomerByPhone contra medsupply_test', () => {
  test('QA-02.4-17 el cliente de pruebas apunta a medsupply_test', async () => {
    const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(rows[0].name).toBe('medsupply_test');
  });

  test('QA-02.4-18 ESC-09 tres formatos identifican al mismo cliente activo', async () => {
    const { f1 } = await fixtures();
    for (const input of ['9 1234 5678', '912345678', '+56 9 1234 5678']) {
      const r = await identifyCustomerByPhone(db, input);
      expect(r.status).toBe('active');
      if (r.status === 'active') expect(r.customer.id).toBe(f1.id);
    }
  });

  test('QA-02.4-19 ESC-10 cliente inactivo en cualquier formato, sin modificarlo', async () => {
    const { f4 } = await fixtures();
    for (const input of ['987654321', '9 8765 4321', '+56 9 8765 4321', '+56987654321']) {
      await expect(identifyCustomerByPhone(db, input)).resolves.toEqual({ status: 'inactive' });
    }
    const after = await db.customer.findUniqueOrThrow({ where: { id: f4.id } });
    expect(after.isActive).toBe(false);
    expect(after.updatedAt).toEqual(f4.updatedAt);
  });

  test('QA-02.4-20 ESC-11 teléfono inexistente', async () => {
    await fixtures();
    await expect(identifyCustomerByPhone(db, '9 0000 0000')).resolves.toEqual({ status: 'not_found' });
    expect(await db.customer.count()).toBe(4);
  });

  test('QA-02.4-21 ESC-12/ESC-21 inválido con su motivo y sin consultar la base', async () => {
    const { f2 } = await fixtures();
    const { dbSpy, findUnique } = spied();
    const cases: [string, object][] = [
      ['abc', { code: 'unsupported_format' }],
      ['   ', { code: 'empty' }],
      ['94907687', { code: 'missing_digits', missing: 1 }],
      ['9490768', { code: 'missing_digits', missing: 2 }],
    ];
    for (const [input, reason] of cases) {
      await expect(identifyCustomerByPhone(dbSpy, input)).resolves.toEqual({ status: 'invalid', reason });
    }
    expect(findUnique).toHaveBeenCalledTimes(0);
    const r = await identifyCustomerByPhone(dbSpy, '94907687');
    expect(r.status).toBe('invalid');
    expect(r.status === 'active' ? r.customer.id : null).not.toBe(f2.id);
  });

  test('QA-02.4-22 ESC-13 prefijo internacional distinto de +56', async () => {
    const { f3 } = await fixtures();
    const { dbSpy, findUnique } = spied();
    const ok = await identifyCustomerByPhone(dbSpy, '+54 9 11 1234 5678');
    expect(ok.status).toBe('active');
    if (ok.status === 'active') expect(ok.customer.id).toBe(f3.id);
    expect(findUnique).toHaveBeenCalledTimes(1);
    findUnique.mockClear();
    await expect(identifyCustomerByPhone(dbSpy, '9 11 1234 5678')).resolves.toEqual({
      status: 'invalid',
      reason: { code: 'extra_digits' },
    });
    expect(findUnique).toHaveBeenCalledTimes(0);
  });

  test('QA-02.4-23 spec 03 ESC-06 fixtures identificados tal como están escritos', async () => {
    const { f1, f2, f3 } = await fixtures();
    const written: [string, number][] = [
      ['912345678', f1.id],
      ['+56 9 4907 6876', f2.id],
      ['+54 9 11 1234 5678', f3.id],
    ];
    for (const [input, id] of written) {
      const r = await identifyCustomerByPhone(db, input);
      expect(r.status).toBe('active');
      if (r.status === 'active') expect(r.customer.id).toBe(id);
    }
  });

  test('QA-02.4-24 ESC-19 identificar no modifica al cliente', async () => {
    const { f1 } = await fixtures();
    for (const input of ['912345678', '9 1234 5678', '+56 9 1234 5678']) await identifyCustomerByPhone(db, input);
    expect(await db.customer.findUniqueOrThrow({ where: { id: f1.id } })).toEqual(f1);
    expect(await db.customer.count()).toBe(4);
  });
});
