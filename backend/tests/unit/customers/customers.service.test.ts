import { identifyCustomerByPhone, normalizePhone } from '../../../src/modules/customers/customers.service';

// TK-02.4 · spec 05 §7.1 (CL-03). Cliente de base de datos falso: solo customer.findUnique.
type Row = { id: number; businessName: string; taxId: string; phone: string; isActive: boolean; createdAt: Date; updatedAt: Date };
const row = (isActive: boolean): Row => ({
  id: 7,
  businessName: 'Farmacia Uno',
  taxId: '11.111.111-1',
  phone: '+56912345678',
  isActive,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});
const fakeDb = (result: Row | null) => {
  const findUnique = jest.fn().mockResolvedValue(result);
  return { db: { customer: { findUnique } }, findUnique };
};

describe('TK-02.4 · identifyCustomerByPhone', () => {
  test.each([
    ['abc', { code: 'unsupported_format' }],
    ['   ', { code: 'empty' }],
    ['94907687', { code: 'missing_digits', missing: 1 }],
    ['9490768', { code: 'missing_digits', missing: 2 }],
  ])('QA-02.4-10/11 ESC-12 %j es inválido y no consulta la base', async (input, reason) => {
    const { db, findUnique } = fakeDb(null);
    await expect(identifyCustomerByPhone(db, input)).resolves.toEqual({ status: 'invalid', reason });
    expect(findUnique).toHaveBeenCalledTimes(0);
  });

  test.each(['912345678', '+56 9 1234 5678', '+54 9 11 1234 5678'])(
    'QA-02.4-12 ESC-18 %j busca por igualdad exacta con el valor normalizado',
    async (input) => {
      const { db, findUnique } = fakeDb(null);
      await identifyCustomerByPhone(db, input);
      const n = normalizePhone(input);
      if (!n.ok) throw new Error('se esperaba válido');
      expect(findUnique).toHaveBeenCalledTimes(1);
      expect(findUnique.mock.calls[0][0]).toStrictEqual({ where: { phone: n.phone } });
    },
  );

  test('QA-02.4-13 inexistente, inactivo y activo', async () => {
    await expect(identifyCustomerByPhone(fakeDb(null).db, '912345678')).resolves.toEqual({ status: 'not_found' });
    await expect(identifyCustomerByPhone(fakeDb(row(false)).db, '912345678')).resolves.toEqual({ status: 'inactive' });
    const active = await identifyCustomerByPhone(fakeDb(row(true)).db, '912345678');
    expect(active).toEqual({ status: 'active', customer: row(true) });
  });

  test('QA-02.4-14 un error de la base se propaga', async () => {
    const boom = new Error('db down');
    const findUnique = jest.fn().mockRejectedValue(boom);
    await expect(identifyCustomerByPhone({ customer: { findUnique } }, '912345678')).rejects.toBe(boom);
  });

  test('QA-02.4-15 solo lectura y sin gestionar la conexión', async () => {
    const findUnique = jest.fn().mockResolvedValue(row(true));
    const spies = Object.fromEntries(
      ['$connect', '$disconnect', 'create', 'update', 'upsert', 'delete'].map((k) => [k, jest.fn()]),
    );
    const db = { customer: { findUnique, ...spies }, $connect: spies.$connect, $disconnect: spies.$disconnect };
    await identifyCustomerByPhone(db, '912345678');
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });
});
