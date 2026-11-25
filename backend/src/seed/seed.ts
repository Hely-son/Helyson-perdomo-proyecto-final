import { hashPassword } from '../modules/auth/password';
import { normalizePhone } from '../modules/customers/customers.service';
import type { PrismaClient } from '../generated/prisma/client';
import type { SeedOperator } from './config';
import type { SeedFixtures } from './fixtures';

// Carga de datos iniciales, idempotente (spec 01 "Seed"; spec 05 §7.3, DP-04; TK-00.4).
// Los mensajes nunca incluyen contraseña, hash, teléfonos ni la URL de la base.

export type SeedLogger = (message: string) => void;

/** Conflicto de cliente (spec 05 §7.3 casos B y C): el seed se detiene. Solo expone el tax_id del fixture. */
export class SeedConflictError extends Error {
  readonly taxId: string;

  constructor(taxId: string) {
    super(`Conflicto con el cliente de tax_id ${taxId}: ya existe un registro incompatible. Se detiene el seed.`);
    this.name = 'SeedConflictError';
    this.taxId = taxId;
  }
}

export interface SeedSummary {
  users: { inserted: number; recognized: number };
  customers: { inserted: number; recognized: number };
  products: { inserted: number; skipped: number };
  orders: { inserted: number; skipped: number };
}

const PRISMA_UNIQUE_VIOLATION = 'P2002';

function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? err.code : undefined;
}

function toCents(amount: string): number {
  const [int = '0', dec = ''] = amount.split('.');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

function fromCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

async function seedOperator(prisma: PrismaClient, operator: SeedOperator, summary: SeedSummary, log: SeedLogger): Promise<void> {
  const email = operator.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing !== null) {
    summary.users.recognized += 1;
    log('Operador: ya existe, sin cambios.');
    return;
  }
  // Una carrera por UNIQUE(email) (P2002) se propaga como error: sin reintento ni update.
  await prisma.user.create({ data: { email, passwordHash: await hashPassword(operator.password), name: operator.name } });
  summary.users.inserted += 1;
  log('Operador: creado.');
}

async function seedCustomers(prisma: PrismaClient, fixtures: SeedFixtures, summary: SeedSummary, log: SeedLogger): Promise<void> {
  for (const fixture of fixtures.customers) {
    const normalized = normalizePhone(fixture.phone);
    if (!normalized.ok) throw new Error(`El teléfono del cliente de tax_id ${fixture.taxId} no se puede normalizar.`);
    const phone = normalized.phone;

    const existing = await prisma.customer.findUnique({ where: { taxId: fixture.taxId } });
    if (existing !== null) {
      if (existing.phone === phone) {
        summary.customers.recognized += 1; // caso A
        continue;
      }
      throw new SeedConflictError(fixture.taxId); // caso B
    }
    try {
      await prisma.customer.create({
        data: { businessName: fixture.businessName, taxId: fixture.taxId, phone, isActive: fixture.isActive },
      });
    } catch (err) {
      if (errorCode(err) === PRISMA_UNIQUE_VIOLATION) throw new SeedConflictError(fixture.taxId); // caso C
      throw err;
    }
    summary.customers.inserted += 1; // caso D
  }
  log(`Clientes: ${summary.customers.inserted} insertados, ${summary.customers.recognized} reconocidos.`);
}

/** Inserta los productos si la tabla está vacía. Devuelve los id por clave del fixture, o null si se omitió. */
async function seedProducts(
  prisma: PrismaClient,
  fixtures: SeedFixtures,
  summary: SeedSummary,
  log: SeedLogger,
): Promise<Map<string, number> | null> {
  if ((await prisma.product.count()) > 0) {
    summary.products.skipped = fixtures.products.length;
    log('Productos: la tabla no está vacía, se omiten.');
    return null;
  }
  const ids = await prisma.$transaction(async (tx) => {
    const map = new Map<string, number>();
    for (const p of fixtures.products) {
      const row = await tx.product.create({
        data: {
          name: p.name,
          description: p.description ?? null,
          price: p.price,
          currentStock: p.currentStock,
          minStockAlert: p.minStockAlert,
          isActive: p.isActive,
        },
      });
      map.set(p.key, row.id);
    }
    return map;
  });
  summary.products.inserted = ids.size;
  log(`Productos: ${ids.size} insertados.`);
  return ids;
}

async function seedOrders(
  prisma: PrismaClient,
  fixtures: SeedFixtures,
  productIds: Map<string, number> | null,
  summary: SeedSummary,
  log: SeedLogger,
): Promise<void> {
  if (productIds === null) {
    summary.orders.skipped = fixtures.orders.length;
    log('Pedidos: se omiten porque los productos no se insertaron en esta ejecución.');
    return;
  }
  if ((await prisma.order.count()) > 0) {
    summary.orders.skipped = fixtures.orders.length;
    log('Pedidos: la tabla no está vacía, se omiten.');
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const o of fixtures.orders) {
      const customer = await tx.customer.findUnique({ where: { taxId: o.customerTaxId } });
      if (customer === null) throw new Error(`Pedido del fixture con cliente inexistente (tax_id ${o.customerTaxId}).`);
      const items = o.items.map((i) => {
        const productId = productIds.get(i.productKey);
        if (productId === undefined) throw new Error(`Pedido del fixture con producto inexistente (clave ${i.productKey}).`);
        return { productId, quantity: i.quantity, unitPrice: i.unitPrice };
      });
      const total = o.items.reduce((acc, i) => acc + i.quantity * toCents(i.unitPrice), 0);
      await tx.order.create({
        data: { customerId: customer.id, status: o.status, totalAmount: fromCents(total), items: { create: items } },
      });
    }
  });
  summary.orders.inserted = fixtures.orders.length;
  log(`Pedidos: ${fixtures.orders.length} insertados.`);
}

export async function runSeed(
  prisma: PrismaClient,
  operator: SeedOperator,
  fixtures: SeedFixtures,
  log: SeedLogger,
): Promise<SeedSummary> {
  const summary: SeedSummary = {
    users: { inserted: 0, recognized: 0 },
    customers: { inserted: 0, recognized: 0 },
    products: { inserted: 0, skipped: 0 },
    orders: { inserted: 0, skipped: 0 },
  };
  await seedOperator(prisma, operator, summary, log);
  await seedCustomers(prisma, fixtures, summary, log);
  const productIds = await seedProducts(prisma, fixtures, summary, log);
  await seedOrders(prisma, fixtures, productIds, summary, log);
  return summary;
}
