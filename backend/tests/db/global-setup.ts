import { recreateTestDatabase } from './helpers/test-database';

// globalSetup de `npm run test:db` (TK-00.5, D-2, A7): recrea y migra medsupply_test una vez, antes de los tests.
// Si algo falla, el error se propaga (sin URL ni contraseña), Jest no ejecuta ningún test y sale con código ≠ 0.
export default async function globalSetup(): Promise<void> {
  await recreateTestDatabase();
  console.log('\nmedsupply_test recreada y migrada');
}
