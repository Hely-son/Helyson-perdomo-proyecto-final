import http from 'node:http';
import type { Express } from 'express';
import type { Client } from 'pg';
import { createApp } from '../../../src/app';
import { createPrismaClient } from '../../../src/lib/prisma';
import type { RealServer } from '../../helpers/concurrent-http';
import { QA_JWT_SECRET } from '../../helpers/jwt';
import { connectTestDatabase, deriveTestDatabaseUrl, TEST_DATABASE_NAME } from './test-database';

// Utilidades de las pruebas de aceptación de TK-03.1 (productos) contra medsupply_test.
// Escenarios: docs/qa/TK-03.1-matrix.md. Contrato: docs/openapi.yaml, schemas Product y ProductList (RNF-02).

export type Db = ReturnType<typeof createPrismaClient>;

export const PRODUCTS = '/api/v1/products';

/** Prisma de pruebas contra medsupply_test; aborta si la base conectada no es esa. */
export async function connectTestPrisma(): Promise<Db> {
  const db = createPrismaClient(deriveTestDatabaseUrl());
  const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (rows[0]?.name !== TEST_DATABASE_NAME) {
    await db.$disconnect();
    throw new Error(`Operación abortada: la base conectada no es ${TEST_DATABASE_NAME}`);
  }
  return db;
}

/** Aplicación real con el Prisma de pruebas y un secreto de prueba con el que el test firma tokens. */
export function buildProductsApp(db: Db): Express {
  return createApp({ auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' }, prisma: db });
}

export interface ProductFixture {
  name?: string;
  description?: string | null;
  price?: string;
  currentStock?: number;
  minStockAlert?: number;
  isActive?: boolean;
}

/** Inserta un producto directamente con Prisma (fixture, D2) y devuelve su id. */
export async function insertProduct(db: Db, data: ProductFixture = {}): Promise<number> {
  const row = await db.product.create({
    data: {
      name: data.name ?? 'Producto QA',
      description: data.description === undefined ? 'Descripción QA' : data.description,
      price: data.price ?? '100.00',
      currentStock: data.currentStock ?? 10,
      minStockAlert: data.minStockAlert ?? 3,
      isActive: data.isActive ?? true,
    },
  });
  return row.id;
}

/** Fila de products tal como está en la base, con el precio como texto de numeric(12,2). */
export interface ProductRow {
  id: number;
  name: string;
  description: string | null;
  price: string;
  current_stock: number;
  min_stock_alert: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function productRow(db: Db, id: number): Promise<ProductRow | undefined> {
  const rows = await db.$queryRaw<ProductRow[]>`
    SELECT id, name, description, price::text AS price, current_stock, min_stock_alert, is_active, created_at, updated_at
    FROM products WHERE id = ${id}`;
  return rows[0];
}

export async function allProductRows(db: Db): Promise<ProductRow[]> {
  return db.$queryRaw<ProductRow[]>`
    SELECT id, name, description, price::text AS price, current_stock, min_stock_alert, is_active, created_at, updated_at
    FROM products ORDER BY id`;
}

export async function productRowOrThrow(db: Db, id: number): Promise<ProductRow> {
  const row = await productRow(db, id);
  if (row === undefined) throw new Error(`No existe el producto ${id}`);
  return row;
}

/** Pedido confirmado mínimo con un ítem del producto (fixture Prisma, D2): devuelve ids de pedido e ítem. */
export async function insertOrderWithItem(
  db: Db,
  productId: number,
  item: { quantity: number; unitPrice: string; totalAmount: string },
): Promise<{ orderId: number; itemId: number }> {
  const customer = await db.customer.create({
    data: { businessName: 'Clínica QA TK-03.1', taxId: '76.031.001-1', phone: '+56930310001' },
  });
  const order = await db.order.create({
    data: {
      customerId: customer.id,
      totalAmount: item.totalAmount,
      items: { create: [{ productId, quantity: item.quantity, unitPrice: item.unitPrice }] },
    },
    include: { items: true },
  });
  return { orderId: order.id, itemId: order.items[0].id };
}

export interface OrderSnapshot {
  order: { id: number; total_amount: string; status: string; updated_at: Date };
  items: { id: number; product_id: number; quantity: number; unit_price: string; updated_at: Date }[];
}

export async function orderSnapshot(db: Db, orderId: number): Promise<OrderSnapshot> {
  const orders = await db.$queryRaw<OrderSnapshot['order'][]>`
    SELECT id, total_amount::text AS total_amount, status::text AS status, updated_at FROM orders WHERE id = ${orderId}`;
  const items = await db.$queryRaw<OrderSnapshot['items']>`
    SELECT id, product_id, quantity, unit_price::text AS unit_price, updated_at FROM order_items WHERE order_id = ${orderId} ORDER BY id`;
  return { order: orders[0], items };
}

const PRODUCT_KEYS = ['createdAt', 'currentStock', 'description', 'id', 'isActive', 'minStockAlert', 'name', 'price', 'updatedAt'];
// Patrón de Money/MoneyInput del contrato.
const MONEY = /^(?!0+\.00$)\d{1,10}\.\d{2}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** Exige un cuerpo conforme al schema Product (additionalProperties: false, tipos y formatos). */
export function expectProductShape(body: unknown): void {
  expect(body).not.toBeNull();
  expect(typeof body).toBe('object');
  const p = body as Record<string, unknown>;
  expect(Object.keys(p).sort()).toEqual(PRODUCT_KEYS);
  expect(Number.isInteger(p.id)).toBe(true);
  expect(typeof p.name).toBe('string');
  expect(p.description === null || typeof p.description === 'string').toBe(true);
  expect(typeof p.price).toBe('string');
  expect(p.price).toMatch(MONEY);
  expect(Number.isInteger(p.currentStock)).toBe(true);
  expect(Number.isInteger(p.minStockAlert)).toBe(true);
  expect(typeof p.isActive).toBe('boolean');
  expect(p.createdAt).toMatch(ISO_UTC);
  expect(p.updatedAt).toMatch(ISO_UTC);
}

/** Exige que el cuerpo Product represente exactamente la fila de la base. */
export function expectProductMatchesRow(body: unknown, row: ProductRow): void {
  expectProductShape(body);
  expect(body).toEqual({
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    currentStock: row.current_stock,
    minStockAlert: row.min_stock_alert,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

/** Exige un cuerpo ProductList exacto: { items: Product[] }. */
export function expectProductListShape(body: unknown): Record<string, unknown>[] {
  expect(body).not.toBeNull();
  expect(typeof body).toBe('object');
  expect(Object.keys(body as object)).toEqual(['items']);
  const items = (body as { items: unknown }).items;
  expect(Array.isArray(items)).toBe(true);
  for (const item of items as unknown[]) expectProductShape(item);
  return items as Record<string, unknown>[];
}

// ---- HTTP real en paralelo (RNF-04) ----

export interface JsonResult {
  status: number;
  body: unknown;
}

/** Una petición JSON por una conexión nueva contra el servidor real (sin agente compartido). */
export function sendJson(server: RealServer, method: string, path: string, token: string, body?: unknown): Promise<JsonResult> {
  return new Promise<JsonResult>((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }
    const req = http.request(
      { host: server.address.address, port: server.address.port, path, method, headers, agent: false },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (raw += chunk));
        res.on('end', () => {
          let parsed: unknown = raw;
          try {
            parsed = raw === '' ? undefined : JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/**
 * Espera a que haya al menos `count` sesiones de medsupply_test esperando un bloqueo de fila
 * (pg_stat_activity, wait_event_type = 'Lock'), distintas del observador. Devuelve si se alcanzó antes del plazo.
 * El observador es un Client fuera de transacción para que cada consulta vea una instantánea nueva.
 */
export async function waitForLockWaiters(observer: Client, count: number, timeoutMs = 4000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
    );
    if (rows[0].n >= count) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

export interface Forced {
  results: JsonResult[];
  /** Si se alcanzó el número de sesiones esperando el bloqueo antes de liberarlo. */
  blocked: boolean;
}

/**
 * Bloquea la fila del producto, lanza las peticiones en el orden dado esperando tras cada una a que quede
 * bloqueada (así el orden de aplicación es el de la cola de bloqueos de PostgreSQL), confirma y espera las respuestas.
 */
export async function forcedInterleave(productId: number, calls: (() => Promise<JsonResult>)[]): Promise<Forced> {
  const locker: Client = await connectTestDatabase();
  const observer: Client = await connectTestDatabase();
  const pending: Promise<JsonResult>[] = [];
  let blocked = true;
  try {
    await locker.query('BEGIN');
    await locker.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [productId]);
    for (let i = 0; i < calls.length; i++) {
      pending.push(calls[i]());
      blocked = (await waitForLockWaiters(observer, i + 1)) && blocked;
    }
    await locker.query('COMMIT');
  } catch (err) {
    await locker.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await locker.end().catch(() => undefined);
    await observer.end().catch(() => undefined);
  }
  return { results: await Promise.all(pending), blocked };
}
