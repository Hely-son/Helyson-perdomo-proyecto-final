import { Prisma } from '../../generated/prisma/client';
import type { PrismaClient } from '../../generated/prisma/client';

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

export interface OrderService {
  confirmOrder(input: ConfirmOrderInput): Promise<ConfirmOrderResult>;
}

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

  return {
    async confirmOrder(input) {
      validate(input);
      for (let n = 1; ; n += 1) {
        try {
          return { ok: true, order: await attempt(input) };
        } catch (err) {
          if (err instanceof RejectionsSignal) return { ok: false, rejections: err.rejections };
          if (isWriteConflict(err) && n < MAX_ATTEMPTS) continue;
          throw err;
        }
      }
    },
  };
}
