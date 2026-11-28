import { z } from 'zod';

const INT32_MAX = 2147483647;
const intString = /^[1-9]\d{0,9}$/;

// Parámetro OrderId: entero >= 1 dentro de int4. Fuera de rango se rechaza con 422 sin consultar la base.
export const orderIdParams = z.object({
  orderId: z.string().regex(intString).transform(Number).pipe(z.number().max(INT32_MAX)),
});

export const ORDER_STATUSES = ['PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const;

// Query de listOrders: status opcional del enum; page >= 1 (acotado a int4); pageSize 1..100. Valores por defecto 1 y 20.
export const listOrdersQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.string().regex(intString).transform(Number).pipe(z.number().max(INT32_MAX)).default(1),
  pageSize: z.string().regex(intString).transform(Number).pipe(z.number().min(1).max(100)).default(20),
});

// ChangeOrderStatusRequest (additionalProperties false). PENDING nunca es destino (RN-05, ESC-19).
export const changeOrderStatusBody = z.strictObject({
  status: z.enum(['PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED']),
});
