/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Compatibilidad de Jest con los imports `.js` del cliente generado de Prisma (TK-02.4).
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  // Las pruebas de base de datos (TK-00.3) necesitan PostgreSQL: se ejecutan con `npm run test:db` (jest.db.config.js).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/db/'],
};
