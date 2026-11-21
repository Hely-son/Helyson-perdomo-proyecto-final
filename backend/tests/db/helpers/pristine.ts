import { connectTestDatabase } from './test-database';

/** Comprueba el estado de una base recién limpiada (QA-00.5-08): tablas vacías, ids en 1 y siguiente pedido MED-00001. */
export async function expectPristine(): Promise<void> {
  const client = await connectTestDatabase();
  try {
    for (const table of ['users', 'customers', 'products', 'orders', 'order_items']) {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
      expect({ table, rows: rows[0].n }).toEqual({ table, rows: 0 });
    }
    const { rows } = await client.query(
      "INSERT INTO customers (business_name, tax_id, phone) VALUES ('P', '5-5', '+56933333333') RETURNING id",
    );
    expect(rows[0].id).toBe(1);
    expect((await client.query('SELECT next_order_number() AS n')).rows[0].n).toBe('MED-00001');
  } finally {
    await client.end();
  }
}
