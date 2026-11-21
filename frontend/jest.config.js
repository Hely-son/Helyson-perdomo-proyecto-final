// Jest para la lógica pura del frontend (TK-00.5, D-9, H1). ESM nativo, sin DOM ni renderizado.
// Los E2E de Playwright (e2e/) quedan fuera de `roots`.
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};
