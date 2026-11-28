import type { PrismaClient } from '../../../src/generated/prisma/client';
import { createOrderService, OrderInputError } from '../../../src/modules/orders/orders.service';

// TK-06.3 · ajuste S-01 (RN-08): `findCustomerOrder` no puede consultar sin un cliente válido. Prisma omite un filtro
// `undefined`, así que la consulta perdería el aislamiento por cliente.

const ORDER_NUMBER = 'MED-00042';

/** Prisma simulado: registra cada consulta `order.findFirst` y no encuentra nada. */
function setup() {
  const findFirst = jest.fn().mockResolvedValue(null);
  const service = createOrderService({ prisma: { order: { findFirst } } as unknown as PrismaClient });
  return { service, findFirst };
}

describe('TK-06.3 · S-01 · findCustomerOrder exige un cliente válido (RN-08)', () => {
  test.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
    ['cero', 0],
    ['negativo', -1],
    ['decimal', 1.5],
    ['NaN', Number.NaN],
    ['infinito', Number.POSITIVE_INFINITY],
    ['texto numérico', '1'],
    ['objeto de filtro', { not: 0 }],
  ])('customerId %s: lanza OrderInputError sin consultar Prisma', async (_label, customerId) => {
    const { service, findFirst } = setup();

    await expect(service.findCustomerOrder(customerId as number, ORDER_NUMBER)).rejects.toThrow(OrderInputError);

    expect(findFirst).not.toHaveBeenCalled();
  });

  test('control · un entero positivo consulta filtrando por número y cliente y devuelve null si no hay coincidencia', async () => {
    const { service, findFirst } = setup();

    await expect(service.findCustomerOrder(1, ORDER_NUMBER)).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where).toEqual({ orderNumber: ORDER_NUMBER, customerId: 1 });
  });
});
