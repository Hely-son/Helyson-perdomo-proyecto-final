import type { Client } from 'pg';
import { connectTestDatabase, resetDatabase, TEST_DATABASE_NAME } from './helpers/test-database';

// Pruebas de aceptación de TK-00.3 · catálogo del esquema (spec 01: "Convenciones", "Entidades del MVP",
// "Índices"; PRD §4.2 y §7; decisiones 2 y 8 de la puerta 1). Nivel I contra medsupply_test.

const MVP_TABLES = ['customers', 'order_items', 'orders', 'products', 'users'];

interface ColumnSpec {
  type: 'integer' | 'text' | 'boolean' | 'numeric(12,2)' | 'timestamptz(3)' | 'order_status';
  nullable?: boolean;
  /** Expresión esperada del DEFAULT. Sin valor: no se comprueba. */
  default?: RegExp;
}

const ID: ColumnSpec = { type: 'integer', default: /^nextval\('[a-z_]+_id_seq'::regclass\)$/ };
const NOW = /^(now\(\)|CURRENT_TIMESTAMP)$/i;
const TIMESTAMPS: Record<string, ColumnSpec> = {
  created_at: { type: 'timestamptz(3)', default: NOW },
  updated_at: { type: 'timestamptz(3)', default: NOW }, // decisión 8: @default(now()) @updatedAt
};

const EXPECTED_COLUMNS: Record<string, Record<string, ColumnSpec>> = {
  users: {
    id: ID,
    email: { type: 'text' },
    password_hash: { type: 'text' },
    name: { type: 'text' },
    ...TIMESTAMPS,
  },
  customers: {
    id: ID,
    business_name: { type: 'text' },
    tax_id: { type: 'text' },
    phone: { type: 'text' },
    is_active: { type: 'boolean', default: /^true$/ },
    ...TIMESTAMPS,
  },
  products: {
    id: ID,
    name: { type: 'text' },
    description: { type: 'text', nullable: true },
    price: { type: 'numeric(12,2)' },
    current_stock: { type: 'integer' },
    min_stock_alert: { type: 'integer' },
    is_active: { type: 'boolean', default: /^true$/ },
    ...TIMESTAMPS,
  },
  orders: {
    id: ID,
    order_number: { type: 'text', default: /^next_order_number\(\)$/ },
    customer_id: { type: 'integer' },
    status: { type: 'order_status', default: /^'PENDING'::order_status$/ },
    total_amount: { type: 'numeric(12,2)' },
    ...TIMESTAMPS,
  },
  order_items: {
    id: ID,
    order_id: { type: 'integer' },
    product_id: { type: 'integer' },
    quantity: { type: 'integer' },
    unit_price: { type: 'numeric(12,2)' },
    ...TIMESTAMPS,
  },
};

interface ColumnRow {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  datetime_precision: number | null;
}

function describeType(row: ColumnRow): string {
  switch (row.data_type) {
    case 'numeric':
      return `numeric(${row.numeric_precision},${row.numeric_scale})`;
    case 'timestamp with time zone':
      return `timestamptz(${row.datetime_precision})`;
    case 'USER-DEFINED':
      return row.udt_name;
    default:
      return row.data_type;
  }
}

let client: Client;

beforeAll(async () => {
  client = await connectTestDatabase();
});

afterAll(async () => {
  await client?.end();
});

describe('TK-00.3 · catálogo del esquema', () => {
  test('QA-00.3-05 el arnés está conectado a medsupply_test y el reset protegido se ejecuta', async () => {
    const { rows } = await client.query<{ name: string }>('SELECT current_database() AS name');
    // Evidencia de ejecución contra la base de pruebas (no imprime la URL).
    console.log(`QA-00.3-05 current_database() = ${rows[0]?.name}`);

    expect(rows[0]?.name).toBe(TEST_DATABASE_NAME);
    await expect(resetDatabase(client)).resolves.toBeUndefined();
  });

  test('QA-00.3-13 el servidor es PostgreSQL 16', async () => {
    const { rows } = await client.query<{ version: number }>(
      "SELECT current_setting('server_version_num')::int AS version",
    );

    expect(rows[0]?.version).toBeGreaterThanOrEqual(160000);
    expect(rows[0]?.version).toBeLessThan(170000);
  });

  test('QA-00.3-14 public contiene solo las tablas MVP y order_status como único enum (sin entidades V2)', async () => {
    const tables = await client.query<{ name: string }>(
      "SELECT tablename::text AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY 1",
    );
    const enums = await client.query<{ name: string }>(
      `SELECT t.typname::text AS name
         FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typtype = 'e'
        ORDER BY 1`,
    );

    expect(tables.rows.map((r) => r.name).sort()).toEqual([...MVP_TABLES, '_prisma_migrations'].sort());
    expect(enums.rows.map((r) => r.name)).toEqual(['order_status']);
  });

  test.each(Object.keys(EXPECTED_COLUMNS))(
    'QA-00.3-15 %s: columnas, tipos, nulabilidad y defaults según la spec 01',
    async (table) => {
      const { rows } = await client.query<ColumnRow>(
        `SELECT column_name::text, data_type::text, udt_name::text, is_nullable::text, column_default::text,
                numeric_precision::int, numeric_scale::int, datetime_precision::int
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position`,
        [table],
      );
      const expected = EXPECTED_COLUMNS[table];

      expect(rows.map((r) => r.column_name).sort()).toEqual(Object.keys(expected).sort());
      for (const row of rows) {
        const spec = expected[row.column_name];
        expect({ column: row.column_name, type: describeType(row), nullable: row.is_nullable }).toEqual({
          column: row.column_name,
          type: spec.type,
          nullable: spec.nullable ? 'YES' : 'NO',
        });
        if (spec.default) {
          expect({ column: row.column_name, default: row.column_default }).toEqual({
            column: row.column_name,
            default: expect.stringMatching(spec.default),
          });
        }
      }
    },
  );

  test('QA-00.3-16 order_status tiene exactamente los estados de RN-05, en orden', async () => {
    const { rows } = await client.query<{ label: string }>(
      `SELECT e.enumlabel::text AS label
         FROM pg_enum e
         JOIN pg_type t ON t.oid = e.enumtypid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'order_status'
        ORDER BY e.enumsortorder`,
    );

    expect(rows.map((r) => r.label)).toEqual(['PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED']);
  });

  test('QA-00.3-18 existen exactamente los índices de la spec 01 (columnas, orden y unicidad)', async () => {
    const { rows } = await client.query<{ table_name: string; columns: string[]; is_unique: boolean; is_primary: boolean }>(
      `SELECT t.relname::text AS table_name,
              ARRAY(SELECT a.attname::text
                      FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                     ORDER BY k.ord) AS columns,
              ix.indisunique AS is_unique,
              ix.indisprimary AS is_primary
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = ANY($1::text[])`,
      [MVP_TABLES],
    );
    const label = (r: { table_name: string; columns: string[]; is_unique: boolean; is_primary: boolean }) =>
      `${r.table_name}(${r.columns.join(', ')})${r.is_primary ? ' PK' : r.is_unique ? ' UNIQUE' : ''}`;

    expect(rows.map(label).sort()).toEqual(
      [
        ...MVP_TABLES.map((t) => `${t}(id) PK`),
        'users(email) UNIQUE',
        'customers(phone) UNIQUE',
        'customers(tax_id) UNIQUE',
        'products(is_active)',
        'orders(order_number) UNIQUE',
        'orders(customer_id)',
        'orders(status, created_at)',
        'order_items(order_id, product_id) UNIQUE',
        'order_items(product_id)',
      ].sort(),
    );
  });

  test('QA-00.3-19 existen exactamente las tres FK de la spec 01, todas ON DELETE RESTRICT', async () => {
    const { rows } = await client.query<{ fk: string; on_delete: string }>(
      `SELECT format('%s.%s -> %s.%s', c.conrelid::regclass::text, a.attname, c.confrelid::regclass::text, af.attname) AS fk,
              c.confdeltype::text AS on_delete
         FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
        WHERE c.contype = 'f' AND n.nspname = 'public' AND array_length(c.conkey, 1) = 1
        ORDER BY 1`,
    );
    const total = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'`,
    );

    expect([...rows].sort((a, b) => (a.fk < b.fk ? -1 : 1))).toEqual(
      [
        { fk: 'order_items.order_id -> orders.id', on_delete: 'r' },
        { fk: 'order_items.product_id -> products.id', on_delete: 'r' },
        { fk: 'orders.customer_id -> customers.id', on_delete: 'r' },
      ],
    );
    expect(total.rows[0]?.count).toBe('3');
  });

  test('QA-00.3-38 el rol de aplicación no es superusuario y es dueño de todos los objetos del esquema', async () => {
    const role = await client.query<{ name: string; is_super: boolean }>(
      'SELECT current_user::text AS name, rolsuper AS is_super FROM pg_roles WHERE rolname = current_user',
    );
    const relations = await client.query<{ name: string; owner: string }>(
      `SELECT c.relname::text AS name, pg_get_userbyid(c.relowner)::text AS owner
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
        ORDER BY 1`,
      [[...MVP_TABLES, '_prisma_migrations', 'order_number_seq']],
    );
    const functions = await client.query<{ owner: string }>(
      `SELECT pg_get_userbyid(p.proowner)::text AS owner
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'next_order_number'`,
    );
    const appRole = role.rows[0]?.name;

    expect(role.rows[0]?.is_super).toBe(false);
    expect([...relations.rows].sort((a, b) => (a.name < b.name ? -1 : 1))).toEqual(
      [...MVP_TABLES, '_prisma_migrations', 'order_number_seq'].sort().map((name) => ({ name, owner: appRole })),
    );
    expect(functions.rows).toEqual([{ owner: appRole }]);
  });
});
