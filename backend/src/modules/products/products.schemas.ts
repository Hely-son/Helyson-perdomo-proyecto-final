import { z } from 'zod';

// MoneyInput del contrato: mayor que 0, exactamente dos decimales, máx. numeric(12,2).
const money = z.string().regex(/^(?!0+\.00$)\d{1,10}\.\d{2}$/);
const INT32_MAX = 2147483647;
const stockInt = z.number().int().min(0).max(INT32_MAX);
const name = z.string().min(1).max(200);
const description = z.string().max(2000).nullable();

// CreateProductRequest (additionalProperties false).
export const createProductBody = z.strictObject({
  name,
  description: description.optional(),
  price: money,
  currentStock: stockInt,
  minStockAlert: stockInt,
});

// UpdateProductRequest: sin currentStock ni isActive (D3, ESC-04, ESC-33); minProperties 1.
export const updateProductBody = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    price: money.optional(),
    minStockAlert: stockInt.optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined));

// Parámetro ProductId: entero >= 1. Fuera de int4 se rechaza con 422 (nunca llega a la base).
export const productIdParams = z.object({
  productId: z
    .string()
    .regex(/^[1-9]\d{0,9}$/)
    .transform(Number)
    .pipe(z.number().max(INT32_MAX)),
});
