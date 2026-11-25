// TK-02.4 · D-A: fábrica del cliente de base de datos, con adaptador y cliente generado simulados.
const PrismaPg = jest.fn();
const PrismaClient = jest.fn();
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg }));
jest.mock('../../../src/generated/prisma/client', () => ({ PrismaClient }));

describe('TK-02.4 · createPrismaClient', () => {
  beforeEach(() => {
    jest.resetModules();
    PrismaPg.mockReset();
    PrismaClient.mockReset();
  });

  test('QA-02.4-16 importar el módulo no construye nada ni exporta instancias', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../../src/lib/prisma') as typeof import('../../../src/lib/prisma');
    expect(PrismaPg).not.toHaveBeenCalled();
    expect(PrismaClient).not.toHaveBeenCalled();
    expect(Object.keys(mod)).toEqual(['createPrismaClient']);
  });

  test('QA-02.4-16 pasa exactamente la URL al adaptador, crea una instancia nueva por llamada y no lee DATABASE_URL', () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://env:env@localhost:1/env';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createPrismaClient } = require('../../../src/lib/prisma') as typeof import('../../../src/lib/prisma');
      const url = 'postgresql://u:p@localhost:5432/explicita';
      const a = createPrismaClient(url);
      const b = createPrismaClient(url);
      expect(PrismaPg).toHaveBeenCalledTimes(2);
      expect(PrismaPg).toHaveBeenNthCalledWith(1, { connectionString: url });
      expect(PrismaClient).toHaveBeenCalledTimes(2);
      expect(PrismaClient.mock.calls[0][0]).toEqual({ adapter: PrismaPg.mock.instances[0] });
      expect(a).not.toBe(b);
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
