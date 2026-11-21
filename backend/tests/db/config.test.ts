import path from 'node:path';

// Pruebas de aceptación de TK-00.5 · configuración de las suites (D-4, R6).

const ROOT = path.resolve(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const unitConfig = require(path.join(ROOT, 'jest.config.js')) as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dbConfig = require(path.join(ROOT, 'jest.db.config.js')) as Record<string, unknown>;

describe('TK-00.5 · configuración de Jest', () => {
  test('QA-00.5-15 npm test no carga tests/db, globalSetup ni setup de base de datos', () => {
    expect(unitConfig.globalSetup).toBeUndefined();
    expect(unitConfig.setupFilesAfterEnv).toBeUndefined();
    expect(unitConfig.testPathIgnorePatterns).toContain('<rootDir>/tests/db/');
  });

  test('QA-00.5-16 test:db recrea una vez (globalSetup), limpia con beforeEach y corre en serie', () => {
    expect(dbConfig.globalSetup).toMatch(/global-setup/);
    expect(dbConfig.setupFilesAfterEnv).toEqual([expect.stringMatching(/reset-before-each/)]);
    expect(dbConfig.maxWorkers).toBe(1);
    expect(dbConfig.roots).toEqual(['<rootDir>/tests/db']);
  });
});
