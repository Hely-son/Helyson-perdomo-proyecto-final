import { connectTestDatabase } from './helpers/test-database';
import { expectPristine } from './helpers/pristine';

// QA-00.5-08 · la limpieza global (beforeEach de setupFilesAfterEnv) deja la base pristina entre tests y entre archivos.

describe('TK-00.5 · aislamiento entre tests (archivo b)', () => {
  test.each([1, 2])('QA-00.5-08 prueba %i empieza con la base limpia y la ensucia', async () => {
    await expectPristine();
    const client = await connectTestDatabase();
    try {
      await client.query("INSERT INTO customers (business_name, tax_id, phone) VALUES ('Sucio', '7-7', '+56955555555')");
      await client.query('SELECT next_order_number()');
    } finally {
      await client.end();
    }
  });
});
