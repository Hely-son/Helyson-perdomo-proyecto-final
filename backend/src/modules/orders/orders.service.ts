import { Prisma } from '../../generated/prisma/client';
import type { PrismaClient } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';

// Confirmación atómica del pedido (spec 04 F-1, D-01..D-04; RN-01..RN-04). Operación de dominio, sin endpoint.

const MONEY_FORMAT = /^\d{1,10}\.\d{2}$/;
const MAX_ATTEMPTS = 4; // 1 + 3 reintentos ante P2034 (ESC-12)

export interface ConfirmItemInput {
  productId: number;
  quantity: number;
  shownUnitPrice: string;
}

export interface ConfirmOrderInput {
  customerId: number;
  items: ConfirmItemInput[];
}

export type Rejection =
  | { productId: number; reason: 'PRODUCT_INACTIVE' }
  | { productId: number; reason: 'STOCK_INSUFFICIENT'; availableStock: number }
  | { productId: number; reason: 'PRICE_CHANGED'; currentUnitPrice: string };

export interface ConfirmedOrder {
  id: number;
  orderNumber: string;
  status: 'PENDING';
  totalAmount: string;
  items: { productId: number; quantity: number; unitPrice: string }[];
}

export type ConfirmOrderResult = { ok: true; order: ConfirmedOrder } | { ok: false; rejections: Rejection[] };

export type OperatorTargetStatus = 'PROCESSING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export interface OrderStatusChange {
  id: number;
  orderNumber: string;
  status: OperatorTargetStatus;
}

export type OrderStatusValue = 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export interface ListOrdersInput {
  status?: OrderStatusValue;
  page: number;
  pageSize: number;
}

export interface OrderSummaryDto {
  id: number;
  orderNumber: string;
  status: OrderStatusValue;
  totalAmount: string;
  customer: { id: number; businessName: string };
  createdAt: string;
}

export interface OrderPageDto {
  items: OrderSummaryDto[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface OrderDetailDto {
  id: number;
  orderNumber: string;
  status: OrderStatusValue;
  totalAmount: string;
  customer: { id: number; businessName: string; taxId: string; phone: string };
  items: { productId: number; productName: string; quantity: number; unitPrice: string; subtotal: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderService {
  listOrders(input: ListOrdersInput): Promise<OrderPageDto>;
  getOrder(orderId: number): Promise<OrderDetailDto>;
  confirmOrder(input: ConfirmOrderInput): Promise<ConfirmOrderResult>;
  changeOrderStatus(orderId: number, target: unknown): Promise<OrderStatusChange>;
}

// Avance del operador (spec 04 D-06): destino → único origen permitido. El stock no cambia (D-07).
const ADVANCE_ORIGIN: Record<'PROCESSING' | 'DISPATCHED' | 'DELIVERED', 'PENDING' | 'PROCESSING' | 'DISPATCHED'> = {
  PROCESSING: 'PENDING',
  DISPATCHED: 'PROCESSING',
  DELIVERED: 'DISPATCHED',
};

/** Control de flujo interno: provoca el ROLLBACK real y se traduce a `{ ok: false }`. No es P2034 ni se reintenta. */
class RejectionsSignal extends Error {
  constructor(readonly rejections: Rejection[]) {
    super('Confirmación rechazada');
    this.name = 'RejectionsSignal';
  }
}

/** Entrada inválida (D-03, D5, D6). Error interno: no es AppError ni un motivo de rechazo, y no se reintenta. */
export class OrderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderInputError';
  }
}

const invalidInput = (message: string) => new OrderInputError(message);

function isWriteConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2034';
}

/** 1 intento + hasta 3 reintentos solo ante P2034 (ESC-12). Cualquier otro error se propaga sin reintentar. */
async function withWriteConflictRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let n = 1; ; n += 1) {
    try {
      return await run();
    } catch (err) {
      if (isWriteConflict(err) && n < MAX_ATTEMPTS) continue;
      throw err;
    }
  }
}

function validate(input: ConfirmOrderInput): void {
  const { items } = input;
  if (!Array.isArray(items) || items.length === 0) throw invalidInput('El pedido debe tener al menos un ítem.');
  const seen = new Set<number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw invalidInput('La cantidad debe ser un entero positivo.');
    if (seen.has(item.productId)) throw invalidInput('El producto está repetido.');
    seen.add(item.productId);
    if (typeof item.shownUnitPrice !== 'string' || !MONEY_FORMAT.test(item.shownUnitPrice)) {
      throw invalidInput('El precio mostrado no tiene el formato esperado.');
    }
  }
}

export function createOrderService(deps: { prisma: PrismaClient }): OrderService {
  const { prisma } = deps;

  async function attempt(input: ConfirmOrderInput): Promise<ConfirmedOrder> {
    // Orden ascendente de productId: prevención de interbloqueos (ARCHITECTURE).
    const items = [...input.items].sort((a, b) => a.productId - b.productId);
    return prisma.$transaction(
      async (tx) => {
        const rejections: Rejection[] = [];
        const priced: { productId: number; quantity: number; unitPrice: Prisma.Decimal }[] = [];

        for (const item of items) {
          // Descuento condicional atómico: una sola sentencia, juzgada por filas afectadas (RN-01).
          const { count } = await tx.product.updateMany({
            where: { id: item.productId, isActive: true, currentStock: { gte: item.quantity } },
            data: { currentStock: { decrement: item.quantity } },
          });
          if (count === 0) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (product === null) throw invalidInput('El producto no existe.'); // D5: ROLLBACK y error
            if (!product.isActive) rejections.push({ productId: item.productId, reason: 'PRODUCT_INACTIVE' });
            else rejections.push({ productId: item.productId, reason: 'STOCK_INSUFFICIENT', availableStock: product.currentStock });
            continue;
          }
          // Fila ya bloqueada por el descuento: el precio leído es el vigente (ESC-11).
          const current = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { price: true } });
          const currentPrice = current.price.toFixed(2);
          if (currentPrice !== item.shownUnitPrice) {
            rejections.push({ productId: item.productId, reason: 'PRICE_CHANGED', currentUnitPrice: currentPrice });
            continue;
          }
          priced.push({ productId: item.productId, quantity: item.quantity, unitPrice: current.price });
        }

        if (rejections.length > 0) throw new RejectionsSignal(rejections);

        const total = priced.reduce((sum, p) => sum.plus(p.unitPrice.times(p.quantity)), new Prisma.Decimal(0));
        const order = await tx.order.create({
          data: {
            customerId: input.customerId,
            status: 'PENDING',
            totalAmount: total,
            items: { create: priced.map((p) => ({ productId: p.productId, quantity: p.quantity, unitPrice: p.unitPrice })) },
          },
          include: { items: { orderBy: { productId: 'asc' } } },
        });
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          status: 'PENDING' as const,
          totalAmount: order.totalAmount.toFixed(2),
          items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice.toFixed(2) })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /** Distingue no encontrado de transición no permitida tras 0 filas afectadas. */
  async function rejectTransition(db: Pick<PrismaClient, 'order'>, orderId: number): Promise<never> {
    const exists = await db.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (exists === null) throw new AppError(404, 'ORDER_NOT_FOUND', 'El pedido no existe.');
    throw new AppError(409, 'INVALID_ORDER_TRANSITION', 'La transición de estado no está permitida.');
  }

  // F-4: una actualización condicional WHERE id AND status = origen.
  async function advance(orderId: number, target: 'PROCESSING' | 'DISPATCHED' | 'DELIVERED'): Promise<OrderStatusChange> {
    const { count } = await prisma.order.updateMany({
      where: { id: orderId, status: ADVANCE_ORIGIN[target] },
      data: { status: target },
    });
    if (count === 0) return rejectTransition(prisma, orderId);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, orderNumber: true } });
    return { id: order.id, orderNumber: order.orderNumber, status: target };
  }

  // F-5: cancelación y restitución de stock en una transacción (RN-09, RN-10).
  async function cancel(orderId: number): Promise<OrderStatusChange> {
    return prisma.$transaction(
      async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { id: orderId, status: { in: ['PENDING', 'PROCESSING'] } },
          data: { status: 'CANCELLED' },
        });
        if (count === 0) return rejectTransition(tx, orderId); // ROLLBACK
        const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { productId: 'asc' } });
        // Orden ascendente de productId (interbloqueos); sin condición de isActive (RN-10).
        for (const item of items) {
          await tx.product.update({ where: { id: item.productId }, data: { currentStock: { increment: item.quantity } } });
        }
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, orderNumber: true } });
        return { id: order.id, orderNumber: order.orderNumber, status: 'CANCELLED' as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  return {
    // F-3 / DP-01: createdAt desc, id desc (determinista); nunca por orderNumber.
    async listOrders({ status, page, pageSize }) {
      const where = status ? { status } : {};
      const [totalItems, rows] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { customer: { select: { id: true, businessName: true } } },
        }),
      ]);
      return {
        items: rows.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          totalAmount: o.totalAmount.toFixed(2),
          customer: { id: o.customer.id, businessName: o.customer.businessName },
          createdAt: o.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
      };
    },

    async getOrder(orderId) {
      const o = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { id: true, businessName: true, taxId: true, phone: true } },
          items: { include: { product: { select: { name: true } } } },
        },
      });
      if (o === null) throw new AppError(404, 'ORDER_NOT_FOUND', 'El pedido no existe.');
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount.toFixed(2),
        customer: { id: o.customer.id, businessName: o.customer.businessName, taxId: o.customer.taxId, phone: o.customer.phone },
        items: o.items.map((i) => ({
          productId: i.productId,
          productName: i.product.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice.toFixed(2),
          subtotal: i.unitPrice.times(i.quantity).toFixed(2),
        })),
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      };
    },

    async confirmOrder(input) {
      validate(input);
      try {
        return { ok: true, order: await withWriteConflictRetry(() => attempt(input)) };
      } catch (err) {
        if (err instanceof RejectionsSignal) return { ok: false, rejections: err.rejections };
        throw err;
      }
    },

    async changeOrderStatus(orderId, target) {
      if (target === 'CANCELLED') return withWriteConflictRetry(() => cancel(orderId));
      if (target === 'PROCESSING' || target === 'DISPATCHED' || target === 'DELIVERED') return advance(orderId, target);
      throw invalidInput('El estado destino no es válido para el operador.');
    },
  };
}
