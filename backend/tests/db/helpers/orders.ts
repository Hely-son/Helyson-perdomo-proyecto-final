import type { Client } from 'pg';
import { assertTestDatabase, connectTestDatabase } from './test-database';
import { type Db, waitForLockWaiters } from './products';

// Utilidades de las pruebas de aceptación de TK-05.3 (confirmación atómica del pedido) contra medsupply_test.
// Escenarios: docs/qa/TK-05.3-matrix.md. Contrato de la operación: spec 04 F-1 y D-01; interfaz aprobada en la puerta 1.
//
// Tipo de los importes (precisión 1 de la puerta 1): `string` con exactamente dos decimales ("100.00"), igual que la
// columna numeric(12,2), el esquema Money del contrato, `ProductService` (`price.toFixed(2)`) y el catálogo del chat.
// Nunca `number`: la aritmética del total se hace con decimales (Prisma.Decimal) o enteros de centavos.

export type Money = string;
export const MONEY_FORMAT = /^\d{1,10}\.\d{2}$/;
export const ORDER_NUMBER_FORMAT = /^MED-\d{5,}$/;

export interface ConfirmItem {
  productId: number;
  quantity: number;
  shownUnitPrice: Money;
}

export interface ConfirmInput {
  customerId: number;
  items: ConfirmItem[];
}

export type Rejection =
  | { productId: number; reason: 'PRODUCT_INACTIVE' }
  | { productId: number; reason: 'STOCK_INSUFFICIENT'; availableStock: number }
  | { productId: number; reason: 'PRICE_CHANGED'; currentUnitPrice: Money };

export interface ConfirmedOrder {
  id: number;
  orderNumber: string;
  status: 'PENDING';
  totalAmount: Money;
  items: { productId: number; quantity: number; unitPrice: Money }[];
}

export type ConfirmResult = { ok: true; order: ConfirmedOrder } | { ok: false; rejections: Rejection[] };

/** Cualquier objeto con `confirmOrder` (el servicio real); el resultado se tipa con la interfaz aprobada. */
export interface ConfirmingService {
  confirmOrder(input: ConfirmInput): unknown;
}

export async function confirm(service: ConfirmingService, input: ConfirmInput): Promise<ConfirmResult> {
  return (await service.confirmOrder(input)) as ConfirmResult;
}

/** Rechazos ordenados por producto (la spec no fija el orden de la lista, D-01). */
export function sortedRejections(result: ConfirmResult): Rejection[] {
  if (result.ok) throw new Error('Se esperaba un rechazo y la confirmación creó el pedido');
  return [...result.rejections].sort((a, b) => a.productId - b.productId);
}

export function confirmedOrder(result: ConfirmResult): ConfirmedOrder {
  if (!result.ok) throw new Error(`Se esperaba un pedido creado y hubo rechazo: ${JSON.stringify(result.rejections)}`);
  return result.order;
}

let customerCounter = 0;

/** Cliente propio de la prueba (teléfono y RUT únicos dentro del test). */
export async function insertCustomer(db: Db): Promise<number> {
  customerCounter += 1;
  const n = String(customerCounter).padStart(4, '0');
  const customer = await db.customer.create({
    data: { businessName: `Clínica QA TK-05.3 ${n}`, taxId: `76.053.${n}-1`, phone: `+569530${n}` },
  });
  return customer.id;
}

/** Stock actual de los productos indicados, leído de la base. */
export async function stockOf(db: Db, ids: number[]): Promise<Record<number, number>> {
  const rows = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, currentStock: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.currentStock]));
}

export async function priceOf(db: Db, id: number): Promise<Money> {
  const row = await db.product.findUniqueOrThrow({ where: { id }, select: { price: true } });
  return row.price.toFixed(2);
}

export async function orderCounts(db: Db): Promise<{ orders: number; items: number }> {
  return { orders: await db.order.count(), items: await db.orderItem.count() };
}

export interface PersistedOrder {
  id: number;
  order_number: string;
  customer_id: number;
  status: string;
  total_amount: string;
  items: { product_id: number; quantity: number; unit_price: string }[];
}

/** Pedidos tal como están en la base (importes como texto de numeric(12,2)), con sus ítems por producto. */
export async function persistedOrders(db: Db): Promise<PersistedOrder[]> {
  const orders = await db.$queryRaw<Omit<PersistedOrder, 'items'>[]>`
    SELECT id, order_number, customer_id, status::text AS status, total_amount::text AS total_amount FROM orders ORDER BY id`;
  const items = await db.$queryRaw<(PersistedOrder['items'][number] & { order_id: number })[]>`
    SELECT order_id, product_id, quantity, unit_price::text AS unit_price FROM order_items ORDER BY order_id, product_id`;
  return orders.map((o) => ({
    ...o,
    items: items.filter((i) => i.order_id === o.id).map((i) => ({ product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price })),
  }));
}

/** Total exacto en centavos (BigInt) de unitPrice × quantity, para comparar sin punto flotante. */
export function exactTotal(items: { quantity: number; unitPrice: Money }[]): Money {
  let cents = 0n;
  for (const item of items) {
    const [whole, frac] = item.unitPrice.split('.');
    cents += (BigInt(whole) * 100n + BigInt(frac)) * BigInt(item.quantity);
  }
  const text = cents.toString().padStart(3, '0');
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

// ---- Secuencia order_number_seq (precisión 4 de la puerta 1) ----
// La secuencia es global y no se revierte. `test:db` la reinicia a 1 antes de cada test (reset-before-each.ts,
// resetDatabase). Las pruebas no la reinician por su cuenta: leen su estado y razonan en términos relativos; solo
// ESC-02 la mueve con setval (protegido por assertTestDatabase) y restaura el estado que leyó.

export interface SequenceState {
  lastValue: number;
  isCalled: boolean;
}

/** Último número ya entregado por la secuencia (0 si aún no se ha usado). */
export function consumed(state: SequenceState): number {
  return state.isCalled ? state.lastValue : state.lastValue - 1;
}

export async function readSequence(client: Client): Promise<SequenceState> {
  const { rows } = await client.query<{ last_value: string; is_called: boolean }>('SELECT last_value::text, is_called FROM order_number_seq');
  return { lastValue: Number(rows[0].last_value), isCalled: rows[0].is_called };
}

/** setval de la secuencia, solo si la base conectada es medsupply_test. */
export async function setSequence(client: Client, value: number, isCalled: boolean): Promise<void> {
  await assertTestDatabase(client);
  await client.query("SELECT setval('order_number_seq', $1, $2)", [value, isCalled]);
}

export function formatOrderNumber(n: number): string {
  return `MED-${String(n).padStart(5, '0')}`;
}

// ---- Fallos inyectados en PostgreSQL (ESC-14) ----
// Un disparador BEFORE INSERT que lanza una excepción. Es independiente de cómo el servicio use Prisma (modelo,
// createMany o SQL) y ocurre después de que el DEFAULT next_order_number() ya consumió un valor de la secuencia
// (los valores por defecto se evalúan antes de los disparadores BEFORE). El nombre es propio de TK-05.3.

export type InjectionTarget = 'order_items' | 'orders';

export async function injectInsertFailure(client: Client, target: InjectionTarget): Promise<() => Promise<void>> {
  await assertTestDatabase(client);
  const fn = `qa_tk053_fail_${target}`;
  await client.query(`CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA TK-05.3: fallo inyectado al insertar en ${target}'; END $$`);
  await client.query(`DROP TRIGGER IF EXISTS ${fn} ON ${target}`);
  await client.query(`CREATE TRIGGER ${fn} BEFORE INSERT ON ${target} FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
  return async () => {
    await client.query(`DROP TRIGGER IF EXISTS ${fn} ON ${target}`);
    await client.query(`DROP FUNCTION IF EXISTS ${fn}()`);
  };
}

// ---------------------------------------------------------------------------------------------
// TK-06.1 · transiciones de estado del pedido por el operador (spec 04 F-4, F-5; spec 02 F-9).
// Escenarios: docs/qa/TK-06.1-matrix.md. Interfaz aprobada en la puerta 1: `changeOrderStatus(orderId, target)` en el
// objeto que devuelve `createOrderService`; éxito `{ id, orderNumber, status }`; errores de dominio `AppError`
// (404 ORDER_NOT_FOUND, 409 INVALID_ORDER_TRANSITION); destino PENDING o fuera del enum: `OrderInputError`.
// ---------------------------------------------------------------------------------------------

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];
/** Destinos que el operador puede pedir (contrato `ChangeOrderStatusRequest`: PENDING nunca es destino). */
export const OPERATOR_TARGETS: OrderStatus[] = ['PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];

export interface StatusChangeResult {
  id: number;
  orderNumber: string;
  status: OrderStatus;
}

/** Forma de la operación nueva. El servicio real aún no la declara (rojo por función inexistente, no por tipos). */
export interface StatusChangingService {
  changeOrderStatus(orderId: number, target: unknown): Promise<StatusChangeResult>;
}

/** Llama a `changeOrderStatus` del servicio sin exigir que su tipo ya la declare. */
export async function changeStatus(service: object, orderId: number, target: unknown): Promise<StatusChangeResult> {
  return (service as StatusChangingService).changeOrderStatus(orderId, target);
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Convierte una promesa en un resultado sin lanzar (evita rechazos sin atender mientras se espera a otras sesiones). */
export function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

export interface OrderFixtureItem {
  productId: number;
  quantity: number;
  unitPrice?: Money;
}

/** Pedido fixture (Prisma) en el estado dado, con sus ítems y el total exacto. No toca el stock de los productos. */
export async function insertOrder(
  db: Db,
  input: { customerId: number; status: OrderStatus; items: OrderFixtureItem[] },
): Promise<{ id: number; orderNumber: string }> {
  const items = input.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice ?? '100.00' }));
  const order = await db.order.create({
    data: { customerId: input.customerId, status: input.status, totalAmount: exactTotal(items), items: { create: items } },
  });
  return { id: order.id, orderNumber: order.orderNumber };
}

export async function statusOf(db: Db, orderId: number): Promise<OrderStatus> {
  const rows = await db.$queryRaw<{ status: OrderStatus }[]>`SELECT status::text AS status FROM orders WHERE id = ${orderId}`;
  return rows[0].status;
}

export interface RowLock {
  /** Espera a que al menos `count` sesiones estén bloqueadas esperando un bloqueo (mecanismo real de PostgreSQL). */
  waitForWaiters(count: number): Promise<boolean>;
  /** Confirma la transacción que retiene la fila y cierra las conexiones auxiliares. */
  release(): Promise<void>;
}

/**
 * Retiene `SELECT … FOR UPDATE` sobre una fila desde una conexión de la prueba (patrón de TK-03.1/03.3/05.3/05.5): las
 * sesiones de la aplicación que quieran escribirla se encolan en el orden en que llegan. No sustituye ninguna pieza de la app.
 */
export async function holdRowLock(table: 'orders' | 'products', id: number): Promise<RowLock> {
  const locker = await connectTestDatabase();
  const observer = await connectTestDatabase();
  try {
    await locker.query('BEGIN');
    await locker.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
  } catch (err) {
    await locker.end().catch(() => undefined);
    await observer.end().catch(() => undefined);
    throw err;
  }
  return {
    waitForWaiters: (count) => waitForLockWaiters(observer, count),
    release: async () => {
      try {
        await locker.query('COMMIT');
      } finally {
        await locker.end().catch(() => undefined);
        await observer.end().catch(() => undefined);
      }
    },
  };
}
