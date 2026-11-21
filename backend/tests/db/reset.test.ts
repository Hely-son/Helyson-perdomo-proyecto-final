import { Client, Pool } from 'pg';
import { connectTestDatabase, resetDatabase, TestDatabaseError, type Queryable } from './helpers/test-database';

// Pruebas de aceptación de TK-00.5 · limpieza transaccional (D-2, A1, A2, A4, A5).

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Se esperaba un rechazo y la promesa se resolvió');
}

/** Cliente falso: registra las sentencias; `failOn` hace fallar las que coincidan. */
function fakeClient(currentDatabase: string, failOn?: RegExp) {
  const statements: string[] = [];
  const client: Queryable = {
    async query(text: string) {
      statements.push(text);
      if (/current_database\(\)/i.test(text)) return { rows: [{ name: currentDatabase }] };
      if (failOn?.test(text)) throw new Error('fallo inyectado');
      return { rows: [] };
    },
  };
  return { client, statements };
}

describe('TK-00.5 · resetDatabase', () => {
  test('QA-00.5-09 orden: current_database() fuera de la transacción, BEGIN, TRUNCATE, secuencias, COMMIT', async () => {
    const { client, statements } = fakeClient('medsupply_test');

    await resetDatabase(client);

    expect(statements).toHaveLength(5);
    expect(statements[0]).toMatch(/current_database\(\)/i);
    expect(statements[1]).toMatch(/^BEGIN$/i);
    expect(statements[2]).toMatch(/TRUNCATE/i);
    expect(statements[3]).toMatch(/order_number_seq/i);
    expect(statements[4]).toMatch(/^COMMIT$/i);
  });

  test('QA-00.5-09 base distinta: una sola sentencia, sin BEGIN', async () => {
    const { client, statements } = fakeClient('medsupply');

    expect(await capture(resetDatabase(client))).toBeInstanceOf(TestDatabaseError);
    expect(statements).toHaveLength(1);
  });

  test('QA-00.5-09 si falla el reinicio de secuencias: ROLLBACK sin COMMIT y se propaga el error original', async () => {
    const { client, statements } = fakeClient('medsupply_test', /ALTER SEQUENCE/i);

    const err = await capture(resetDatabase(client));

    expect((err as Error).message).toBe('fallo inyectado');
    expect(statements[statements.length - 1]).toMatch(/^ROLLBACK$/i);
    expect(statements.join('\n')).not.toMatch(/COMMIT/i);
  });

  test('QA-00.5-10 atomicidad real: con fallo en el reinicio de la secuencia, las filas siguen y la secuencia no se reinicia', async () => {
    const real = await connectTestDatabase();
    try {
      const { rows } = await real.query<{ id: number }>(
        "INSERT INTO customers (business_name, tax_id, phone) VALUES ('Atom', '9-9', '+56922222222') RETURNING id",
      );
      await real.query('INSERT INTO orders (customer_id, total_amount) VALUES ($1, 10)', [rows[0].id]);
      const failing: Queryable = {
        query: (text, values) => {
          if (/ALTER SEQUENCE/i.test(text)) return Promise.reject(new Error('fallo inyectado'));
          return real.query(text, values);
        },
      };

      expect(await capture(resetDatabase(failing))).toBeInstanceOf(Error);

      expect((await real.query('SELECT count(*)::int AS n FROM customers')).rows[0].n).toBe(1);
      expect((await real.query('SELECT count(*)::int AS n FROM orders')).rows[0].n).toBe(1);
      expect((await real.query('SELECT next_order_number() AS n')).rows[0].n).toBe('MED-00002');
    } finally {
      await real.end();
    }
  });

  test('QA-00.5-11 un pg.Pool se rechaza en ejecución antes de cualquier sentencia', async () => {
    const poolQuery = jest.spyOn(Pool.prototype, 'query');
    const poolConnect = jest.spyOn(Pool.prototype, 'connect');
    const clientQuery = jest.spyOn(Client.prototype, 'query');
    const clientConnect = jest.spyOn(Client.prototype, 'connect');
    const pool = new Pool({ connectionString: 'postgresql://u:p@127.0.0.1:1/medsupply_test' });
    try {
      const err = await capture(resetDatabase(pool as unknown as Queryable));

      expect(err).toBeInstanceOf(TestDatabaseError);
      expect(poolQuery).not.toHaveBeenCalled();
      expect(poolConnect).not.toHaveBeenCalled();
      expect(clientQuery).not.toHaveBeenCalled();
      expect(clientConnect).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
      await pool.end();
    }
  });
});
