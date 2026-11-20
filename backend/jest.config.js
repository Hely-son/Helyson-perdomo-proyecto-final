/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Las pruebas de base de datos (TK-00.3) necesitan PostgreSQL: se ejecutan con `npm run test:db` (jest.db.config.js).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/db/'],
};
