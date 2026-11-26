import { createOrderService } from '../../../src/modules/orders/orders.service';

// Pruebas de aceptación de TK-05.3 · entrada inválida de la confirmación (spec 04 ESC-13, D-03 v1.1; RNF-03).
// D6: `shownUnitPrice` solo se acepta como cadena con el formato ^\d{1,10}\.\d{2}$; cualquier otra cosa se rechaza
// antes de abrir la transacción, sin conversión ni normalización silenciosa.
// Nivel U: sin base de datos. El Prisma de la prueba falla ante cualquier acceso y registra a qué se intentó acceder.
// Matriz: docs/qa/TK-05.3-matrix.md.

/** Prisma que registra cada propiedad leída después de crear el servicio y lanza si se usa. */
function untouchablePrisma() {
  const accesses: string[] = [];
  const prisma = new Proxy(
    {},
    {
      get(_target, prop) {
        accesses.push(String(prop));
        return () => {
          throw new Error(`Acceso inesperado a prisma.${String(prop)}`);
        };
      },
    },
  );
  return { prisma, accesses };
}

const valid = { productId: 1, quantity: 2, shownUnitPrice: '100.00' };

function setup() {
  const { prisma, accesses } = untouchablePrisma();
  const service = createOrderService({ prisma: prisma as never });
  accesses.length = 0; // lo que ocurra al construir el servicio no cuenta; sí lo que ocurra al confirmar
  return { service, accesses };
}

describe('TK-05.3 · ESC-13 (spec 04) · entrada inválida: error de programación sin abrir transacción (D-03)', () => {
  const cases: [string, unknown[]][] = [
    ['lista de ítems vacía', []],
    ['cantidad 0', [{ ...valid, quantity: 0 }]],
    ['cantidad negativa', [{ ...valid, quantity: -1 }]],
    ['el mismo producto dos veces', [valid, { ...valid, quantity: 1 }]],
    ['un ítem válido junto a uno con cantidad 0', [valid, { productId: 2, quantity: 0, shownUnitPrice: '50.00' }]],
    ['el mismo producto repetido entre ítems distintos', [valid, { productId: 2, quantity: 1, shownUnitPrice: '50.00' }, { ...valid, quantity: 3 }]],
  ];

  test.each(cases)('ESC-13 · %s: lanza error, no devuelve un rechazo de negocio y no toca la base', async (_name, items) => {
    const { service, accesses } = setup();

    await expect((async () => service.confirmOrder({ customerId: 1, items: items as never }))()).rejects.toBeInstanceOf(Error);

    expect(accesses).toEqual([]);
  });

  test('ESC-13 · el error de entrada inválida no se presenta como rechazo `ok: false` ni se convierte en resultado', async () => {
    const { service } = setup();
    let outcome: unknown = 'sin resultado';

    try {
      outcome = await service.confirmOrder({ customerId: 1, items: [] });
    } catch (error) {
      outcome = error;
    }

    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).not.toHaveProperty('ok');
  });
});

describe('TK-05.3 · ESC-13 (spec 04 v1.1) · D6 · formato de shownUnitPrice: solo ^\\d{1,10}\\.\\d{2}$, validado antes de la transacción', () => {
  const invalidPrices: [string, unknown][] = [
    ['número entero 100', 100],
    ['número decimal 100.5', 100.5],
    ['número con dos decimales 100.25', 100.25],
    ['cadena con un decimal "100.5"', '100.5'],
    ['cadena sin decimales "100"', '100'],
    ['negativo "-1.00"', '-1.00'],
    ['cadena vacía', ''],
    ['coma decimal "1,00"', '1,00'],
    ['espacio inicial " 100.00"', ' 100.00'],
    ['espacio final "100.00 "', '100.00 '],
    ['tres decimales "100.000"', '100.000'],
    ['texto "abc"', 'abc'],
    ['notación científica "1e2"', '1e2'],
    ['sin parte entera ".50"', '.50'],
    ['más de 10 dígitos enteros "12345678901.00"', '12345678901.00'],
    ['null', null],
    ['ausente (undefined)', undefined],
  ];

  test.each(invalidPrices)('D6 · shownUnitPrice %s: lanza error, no se invoca $transaction y no se toca prisma', async (_name, shownUnitPrice) => {
    const { service, accesses } = setup();

    await expect((async () => service.confirmOrder({ customerId: 1, items: [{ productId: 1, quantity: 2, shownUnitPrice } as never] }))()).rejects.toBeInstanceOf(Error);

    expect(accesses).not.toContain('$transaction');
    expect(accesses).toEqual([]);
  });

  test('D6 · un precio inválido en un solo ítem de varios invalida toda la confirmación antes de la transacción', async () => {
    const { service, accesses } = setup();
    const items = [valid, { productId: 2, quantity: 1, shownUnitPrice: 50 }, { productId: 3, quantity: 1, shownUnitPrice: '10.00' }];

    await expect((async () => service.confirmOrder({ customerId: 1, items: items as never }))()).rejects.toBeInstanceOf(Error);

    expect(accesses).toEqual([]);
  });

  test('D6 · sin conversión silenciosa: el error es el de entrada inválida (misma clase que una lista vacía), no un rechazo ni un resultado', async () => {
    const { service } = setup();
    const caught = async (input: unknown) => {
      try {
        return await service.confirmOrder(input as never);
      } catch (error) {
        return error;
      }
    };

    const emptyList = await caught({ customerId: 1, items: [] });
    const numericPrice = await caught({ customerId: 1, items: [{ ...valid, shownUnitPrice: 100 }] });

    expect(numericPrice).toBeInstanceOf(Error);
    expect(emptyList).toBeInstanceOf(Error);
    expect((numericPrice as Error).constructor).toBe((emptyList as Error).constructor);
    expect(numericPrice).not.toHaveProperty('ok');
  });
});
