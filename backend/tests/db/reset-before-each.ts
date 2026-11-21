import { connectTestDatabase, resetDatabase } from './helpers/test-database';

// setupFilesAfterEnv de `npm run test:db` (TK-00.5, A4): vacía medsupply_test antes de cada test.
// Es un beforeEach (no un afterEach) para no interferir con los mocks que guard.test.ts restaura en su afterEach.
// El Client de limpieza lo abre y lo cierra este arnés en cada ejecución.
beforeEach(async () => {
  const client = await connectTestDatabase();
  try {
    await resetDatabase(client);
  } finally {
    await client.end();
  }
});
