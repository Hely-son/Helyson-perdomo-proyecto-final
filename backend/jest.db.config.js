/** @type {import('jest').Config} */
// Pruebas de base de datos contra medsupply_test (TK-00.3, decisión 4; TK-00.5). Se ejecutan en serie con `npm run test:db`.
// globalSetup recrea y migra medsupply_test una vez por ejecución; setupFilesAfterEnv la vacía antes de cada test.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/db'],
  testMatch: ['**/*.test.ts'],
  // Compatibilidad de Jest con los imports `.js` del cliente generado de Prisma (TK-02.4).
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  maxWorkers: 1,
  globalSetup: '<rootDir>/tests/db/global-setup.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/db/reset-before-each.ts'],
};
