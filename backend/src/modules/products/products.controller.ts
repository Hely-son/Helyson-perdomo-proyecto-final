import type { Request, RequestHandler } from 'express';
import type { AdjustStockInput, CreateProductInput, ProductService, UpdateProductInput } from './products.service';

// Los parámetros ya fueron validados y convertidos por productIdParams.
const idOf = (req: Request) => (req.params as unknown as { productId: number }).productId;

export interface ProductController {
  list: RequestHandler;
  create: RequestHandler;
  get: RequestHandler;
  update: RequestHandler;
  deactivate: RequestHandler;
  adjustStock: RequestHandler;
}

export function createProductController(service: ProductService): ProductController {
  return {
    list: async (_req, res) => {
      res.status(200).json(await service.list());
    },
    create: async (req, res) => {
      res.status(201).json(await service.create(req.body as CreateProductInput));
    },
    get: async (req, res) => {
      res.status(200).json(await service.get(idOf(req)));
    },
    update: async (req, res) => {
      res.status(200).json(await service.update(idOf(req), req.body as UpdateProductInput));
    },
    deactivate: async (req, res) => {
      res.status(200).json(await service.deactivate(idOf(req)));
    },
    adjustStock: async (req, res) => {
      res.status(200).json(await service.adjustStock(idOf(req), req.body as AdjustStockInput));
    },
  };
}
