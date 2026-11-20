import { DatabaseError, type Client } from 'pg';
import { connectTestDatabase, resetDatabase } from './helpers/test-database';

// Pruebas de aceptación de TK-00.3 · restricciones (spec 01: "Restricciones en base de datos", "Convenciones"
// (Restrict), "Índices" (únicos); RN-01, RN-03, RN-05, RN-10, RN-12; ESC-17 de la spec 05; decisión 7).
// Nivel I contra medsupply_test. Las inserciones son directas (sin servicios), con consultas parametrizadas.
//
// SQLSTATE: 23514 CHECK, 23505 único, 23503 FK (PostgreSQL 16 usa 23503 también para ON DELETE RESTRICT;
// que la acción sea RESTRICT y no NO ACTION lo verifica QA-00.3-19 en el catálogo), 22P02 enum inválido.

let client: Client;

beforeAll(async () => {
  client = await connectTestDatabase();
});

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await resetDatabase(client);
});

/** Espera un error de PostgreSQL con el SQLSTATE indicado y, si se da, la tabla afectada. */
async function expectPgError(promise: Promise<unknown>, code: string, table?: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(DatabaseError);
  const err = caught as DatabaseError;
  if (table === undefined) {
    expect({ code: err.code }).toEqual({ code });
  } else {
    expect({ code: err.code, table: err.table }).toEqual({ code, table });
  }
}

let sequence = 0;
function unique(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

async function insertCustomer(phone = `+5691${String(1000000 + sequence++).slice(-7)}`): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    'INSERT INTO customers (business_name, tax_id, phone) VALUES ($1, $2, $3) RETURNING id',
    ['Clínica QA', unique('tax'), phone],
  );
  return rows[0].id;
}

interface ProductValues {
  price?: string;
  currentStock?: number;
  minStockAlert?: number;
}

function insertProductQuery({ price = '10.00', currentStock = 5, minStockAlert = 1 }: ProductValues = {}) {
  return client.query<{ id: number }>(
    'INSERT INTO products (name, price, current_stock, min_stock_alert) VALUES ($1, $2, $3, $4) RETURNING id',
    [unique('Producto QA'), price, currentStock, minStockAlert],
  );
}

async function insertProduct(values: ProductValues = {}): Promise<number> {
  return (await insertProductQuery(values)).rows[0].id;
}

function insertOrderQuery(customerId: number, totalAmount = '10.00') {
  return client.query<{ id: number; order_number: string; status: string }>(
    'INSERT INTO orders (customer_id, total_amount) VALUES ($1, $2) RETURNING id, order_number, status::text AS status',
    [customerId, totalAmount],
  );
}

async function insertOrder(customerId: number, totalAmount = '10.00'): Promise<number> {
  return (await insertOrderQuery(customerId, totalAmount)).rows[0].id;
}

function insertItemQuery(orderId: number, productId: number, quantity = 1, unitPrice = '10.00') {
  return client.query<{ id: number }>(
    'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4) RETURNING id',
    [orderId, productId, quantity, unitPrice],
  );
}

async function count(table: 'customers' | 'products' | 'orders' | 'order_items' | 'users'): Promise<number> {
  const queries = {
    customers: 'SELECT count(*)::int AS n FROM customers',
    products: 'SELECT count(*)::int AS n FROM products',
    orders: 'SELECT count(*)::int AS n FROM orders',
    order_items: 'SELECT count(*)::int AS n FROM order_items',
    users: 'SELECT count(*)::int AS n FROM users',
  } as const;
  const { rows } = await client.query<{ n: number }>(queries[table]);
  return rows[0].n;
}

const MISSING_ID = 999999;

describe('TK-00.3 · enum y relaciones', () => {
  test('QA-00.3-17 un pedido sin status queda PENDING y un valor fuera del enum se rechaza (22P02)', async () => {
    const customerId = await insertCustomer();

    const { rows } = await insertOrderQuery(customerId);
    expect(rows[0].status).toBe('PENDING');

    await expectPgError(
      client.query('INSERT INTO orders (customer_id, total_amount, status) VALUES ($1, $2, $3)', [customerId, '10.00', 'FOO']),
      '22P02',
    );
  });

  test('QA-00.3-20 pedido con cliente inexistente: 23503', async () => {
    await expectPgError(insertOrderQuery(MISSING_ID), '23503');
  });

  test('QA-00.3-20 ítem con pedido inexistente o con producto inexistente: 23503', async () => {
    const orderId = await insertOrder(await insertCustomer());
    const productId = await insertProduct();

    await expectPgError(insertItemQuery(MISSING_ID, productId), '23503');
    await expectPgError(insertItemQuery(orderId, MISSING_ID), '23503');
  });
});

describe('TK-00.3 · CHECK de la spec 01', () => {
  test('QA-00.3-21 products.current_stock: -1 se rechaza al insertar y al actualizar; 0 se acepta (RN-01)', async () => {
    await expectPgError(insertProductQuery({ currentStock: -1 }), '23514', 'products');
    const productId = await insertProduct({ currentStock: 0 });

    await expectPgError(client.query('UPDATE products SET current_stock = $1 WHERE id = $2', [-1, productId]), '23514', 'products');

    const { rows } = await client.query<{ current_stock: number }>('SELECT current_stock FROM products WHERE id = $1', [productId]);
    expect(rows[0].current_stock).toBe(0);
  });

  test('QA-00.3-22 products.min_stock_alert: -1 se rechaza; 0 se acepta', async () => {
    await expectPgError(insertProductQuery({ minStockAlert: -1 }), '23514', 'products');
    await expect(insertProduct({ minStockAlert: 0 })).resolves.toEqual(expect.any(Number));
  });

  test('QA-00.3-23 products.price: 0 y -0.01 se rechazan; 0.01 se acepta', async () => {
    await expectPgError(insertProductQuery({ price: '0' }), '23514', 'products');
    await expectPgError(insertProductQuery({ price: '-0.01' }), '23514', 'products');
    await expect(insertProduct({ price: '0.01' })).resolves.toEqual(expect.any(Number));
  });

  test('QA-00.3-24 orders.total_amount: 0 se rechaza; 0.01 se acepta', async () => {
    const customerId = await insertCustomer();

    await expectPgError(insertOrderQuery(customerId, '0'), '23514', 'orders');
    await expect(insertOrder(customerId, '0.01')).resolves.toEqual(expect.any(Number));
  });

  test('QA-00.3-25 order_items.quantity: 0 y -1 se rechazan; 1 se acepta', async () => {
    const orderId = await insertOrder(await insertCustomer());
    const productId = await insertProduct();

    await expectPgError(insertItemQuery(orderId, productId, 0), '23514', 'order_items');
    await expectPgError(insertItemQuery(orderId, productId, -1), '23514', 'order_items');
    await expect(insertItemQuery(orderId, productId, 1)).resolves.toBeDefined();
  });

  test('QA-00.3-26 order_items.unit_price: 0 se rechaza; 0.01 se acepta (RN-03)', async () => {
    const orderId = await insertOrder(await insertCustomer());
    const productId = await insertProduct();

    await expectPgError(insertItemQuery(orderId, productId, 1, '0'), '23514', 'order_items');
    await expect(insertItemQuery(orderId, productId, 1, '0.01')).resolves.toBeDefined();
  });

  test.each(['9 1234 5678', '912345678', '+56 9 1234 5678', '+', ''])(
    'QA-00.3-27 ESC-17 customers.phone sin normalizar "%s" se rechaza (RN-12)',
    async (phone) => {
      await expectPgError(
        client.query('INSERT INTO customers (business_name, tax_id, phone) VALUES ($1, $2, $3)', ['Clínica QA', unique('tax'), phone]),
        '23514',
        'customers',
      );
    },
  );

  test('QA-00.3-27 ESC-17 customers.phone normalizado +56912345678 se acepta', async () => {
    await expect(insertCustomer('+56912345678')).resolves.toEqual(expect.any(Number));
  });
});

describe('TK-00.3 · Restrict (RN-10)', () => {
  test('QA-00.3-28 borrar un producto con pedidos falla y no borra nada; un producto sin ítems sí se borra', async () => {
    const orderId = await insertOrder(await insertCustomer());
    const soldProduct = await insertProduct();
    const unsoldProduct = await insertProduct();
    await insertItemQuery(orderId, soldProduct);

    await expectPgError(client.query('DELETE FROM products WHERE id = $1', [soldProduct]), '23503');
    expect(await count('products')).toBe(2);
    expect(await count('order_items')).toBe(1);

    const deleted = await client.query('DELETE FROM products WHERE id = $1', [unsoldProduct]);
    expect(deleted.rowCount).toBe(1);
  });

  test('QA-00.3-29 borrar un cliente con pedidos falla y no borra nada', async () => {
    const customerId = await insertCustomer();
    await insertOrder(customerId);

    await expectPgError(client.query('DELETE FROM customers WHERE id = $1', [customerId]), '23503');
    expect(await count('customers')).toBe(1);
    expect(await count('orders')).toBe(1);
  });

  test('QA-00.3-30 borrar un pedido con ítems falla y no borra nada', async () => {
    const orderId = await insertOrder(await insertCustomer());
    await insertItemQuery(orderId, await insertProduct());

    await expectPgError(client.query('DELETE FROM orders WHERE id = $1', [orderId]), '23503');
    expect(await count('orders')).toBe(1);
    expect(await count('order_items')).toBe(1);
  });
});

describe('TK-00.3 · unicidades', () => {
  test('QA-00.3-31 users.email repetido: 23505', async () => {
    const insertUser = () =>
      client.query('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', ['operador@qa.test', 'hash-qa', 'Operador QA']);
    await insertUser();

    await expectPgError(insertUser(), '23505', 'users');
  });

  test('QA-00.3-31 customers.tax_id repetido: 23505', async () => {
    const insert = (phone: string) =>
      client.query('INSERT INTO customers (business_name, tax_id, phone) VALUES ($1, $2, $3)', ['Clínica QA', '11111111-1', phone]);
    await insert('+56911111111');

    await expectPgError(insert('+56922222222'), '23505', 'customers');
  });

  test('QA-00.3-31 customers.phone repetido: 23505 (CL-03)', async () => {
    await insertCustomer('+56933333333');

    await expectPgError(insertCustomerQuery('+56933333333'), '23505', 'customers');
  });

  test('QA-00.3-31 orders.order_number repetido: 23505', async () => {
    const customerId = await insertCustomer();
    const { rows } = await insertOrderQuery(customerId);

    await expectPgError(
      client.query('INSERT INTO orders (order_number, customer_id, total_amount) VALUES ($1, $2, $3)', [rows[0].order_number, customerId, '10.00']),
      '23505',
      'orders',
    );
  });

  test('QA-00.3-31 order_items (order_id, product_id) repetido: 23505; el mismo producto en otro pedido se acepta', async () => {
    const customerId = await insertCustomer();
    const firstOrder = await insertOrder(customerId);
    const secondOrder = await insertOrder(customerId);
    const productId = await insertProduct();
    await insertItemQuery(firstOrder, productId);

    await expectPgError(insertItemQuery(firstOrder, productId, 2), '23505', 'order_items');
    await expect(insertItemQuery(secondOrder, productId)).resolves.toBeDefined();
  });
});

function insertCustomerQuery(phone: string) {
  return client.query('INSERT INTO customers (business_name, tax_id, phone) VALUES ($1, $2, $3)', ['Clínica QA', unique('tax'), phone]);
}
