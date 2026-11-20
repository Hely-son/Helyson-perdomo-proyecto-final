import { DatabaseError, type Client } from 'pg';
import { assertTestDatabase, connectTestDatabase, resetDatabase } from './helpers/test-database';

// Pruebas de aceptación de TK-00.3 · secuencia y next_order_number() (spec 01, Order → `order_number`; RN-04;
// ESC-02 de la spec 04, solo la parte de base de datos con INSERT directos (decisión 7); QA-00.3-37 por la
// decisión 18; requisitos de seguridad de la puerta 1). Nivel I contra medsupply_test.

const ORDER_NUMBER_FORMAT = /^MED-\d{5,}$/;

let client: Client;
let customerId: number;

beforeAll(async () => {
  client = await connectTestDatabase();
});

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  // resetDatabase reinicia order_number_seq a 1: equivale a una base recién migrada.
  await resetDatabase(client);
  const { rows } = await client.query<{ id: number }>(
    'INSERT INTO customers (business_name, tax_id, phone) VALUES ($1, $2, $3) RETURNING id',
    ['Clínica QA', '22222222-2', '+56944444444'],
  );
  customerId = rows[0].id;
});

/** setval protegido por el guard: nunca se ejecuta fuera de medsupply_test. */
async function setOrderNumberSequence(value: number): Promise<void> {
  await assertTestDatabase(client);
  await client.query("SELECT setval('order_number_seq', $1)", [value]);
}

async function insertOrder(): Promise<string> {
  const { rows } = await client.query<{ order_number: string }>(
    'INSERT INTO orders (customer_id, total_amount) VALUES ($1, $2) RETURNING order_number',
    [customerId, '10.00'],
  );
  return rows[0].order_number;
}

describe('TK-00.3 · secuencia y next_order_number()', () => {
  test('QA-00.3-32 order_number_seq y next_order_number() existen con la definición segura esperada', async () => {
    const sequence = await client.query<{ start_value: string; increment_by: string; min_value: string; cycle: boolean }>(
      `SELECT start_value::text, increment_by::text, min_value::text, cycle
         FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'order_number_seq'`,
    );
    const fn = await client.query<{
      result: string;
      args: number;
      volatility: string;
      security_definer: boolean;
      language: string;
      definition: string;
    }>(
      `SELECT pg_get_function_result(p.oid)::text AS result, p.pronargs::int AS args, p.provolatile::text AS volatility,
              p.prosecdef AS security_definer, l.lanname::text AS language, pg_get_functiondef(p.oid)::text AS definition
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = 'public' AND p.proname = 'next_order_number'`,
    );

    expect(sequence.rows).toEqual([{ start_value: '1', increment_by: '1', min_value: '1', cycle: false }]);
    expect(fn.rows).toHaveLength(1);
    const definition = fn.rows[0];
    expect({
      result: definition.result,
      args: definition.args,
      volatility: definition.volatility,
      security_definer: definition.security_definer,
    }).toEqual({ result: 'text', args: 0, volatility: 'v', security_definer: false });
    expect(['sql', 'plpgsql']).toContain(definition.language);
    expect(definition.definition.match(/nextval\s*\(/gi)).toHaveLength(1);
    expect(definition.definition).not.toMatch(/\bEXECUTE\b|\bformat\s*\(/i);
  });

  test('QA-00.3-33 los primeros pedidos reciben MED-00001 y MED-00002 (un solo nextval por INSERT)', async () => {
    expect(await insertOrder()).toBe('MED-00001');
    expect(await insertOrder()).toBe('MED-00002');
  });

  test('QA-00.3-34 ESC-02 parte BD: MED-00001 y, con la secuencia forzada a 99 999, MED-100000 sin recortar', async () => {
    expect(await insertOrder()).toBe('MED-00001');

    await setOrderNumberSequence(99999);

    expect(await insertOrder()).toBe('MED-100000');
  });

  test('QA-00.3-34 paso de cinco a seis dígitos: MED-99999 y después MED-100000', async () => {
    await setOrderNumberSequence(99998);

    expect(await insertOrder()).toBe('MED-99999');
    expect(await insertOrder()).toBe('MED-100000');
  });

  test('QA-00.3-35 sin límite de longitud: MED-1000000', async () => {
    await setOrderNumberSequence(999999);

    expect(await insertOrder()).toBe('MED-1000000');
  });

  test('QA-00.3-36 order_number nunca queda nulo; con DEFAULT cumple el formato de RN-04', async () => {
    let caught: unknown;
    try {
      await client.query('INSERT INTO orders (order_number, customer_id, total_amount) VALUES (NULL, $1, $2)', [customerId, '10.00']);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DatabaseError);
    const err = caught as DatabaseError;
    expect({ code: err.code, table: err.table, column: err.column }).toEqual({
      code: '23502',
      table: 'orders',
      column: 'order_number',
    });

    const { rows } = await client.query<{ order_number: string }>(
      'INSERT INTO orders (order_number, customer_id, total_amount) VALUES (DEFAULT, $1, $2) RETURNING order_number',
      [customerId, '10.00'],
    );
    expect(rows[0].order_number).toMatch(ORDER_NUMBER_FORMAT);
  });

  test('QA-00.3-37 un INSERT revertido consume un número: el siguiente pedido salta un valor (RN-04)', async () => {
    await client.query('BEGIN');
    try {
      expect(await insertOrder()).toBe('MED-00001');
    } finally {
      await client.query('ROLLBACK');
    }

    expect(await insertOrder()).toBe('MED-00002');
    const { rows } = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM orders');
    expect(rows[0].n).toBe(1);
  });
});
