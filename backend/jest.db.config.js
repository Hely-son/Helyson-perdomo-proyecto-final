/** @type {import('jest').Config} */
// Pruebas de base de datos contra medsupply_test (TK-00.3, decisión 4). Se ejecutan en serie con `npm run test:db`.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/db'],
  testMatch: ['**/*.test.ts'],
  maxWorkers: 1,
};
