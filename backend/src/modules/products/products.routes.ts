import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { createProductController } from './products.controller';
import { adjustStockBody, createProductBody, productIdParams, updateProductBody } from './products.schemas';
import type { ProductService } from './products.service';

// Sin borrado ni reactivación (RN-10, ESC-08, ESC-33). Las rutas fijas (p. ej. /products/alerts de
// TK-04.1) deben registrarse antes que /products/:productId.
export function createProductsRouter(service: ProductService): Router {
  const c = createProductController(service);
  const router = Router();
  router.get('/products', c.list);
  router.post('/products', validate({ body: createProductBody }), c.create);
  router.get('/products/:productId', validate({ params: productIdParams }), c.get);
  router.patch('/products/:productId', validate({ params: productIdParams, body: updateProductBody }), c.update);
  router.post('/products/:productId/deactivate', validate({ params: productIdParams }), c.deactivate);
  router.patch('/products/:productId/stock', validate({ params: productIdParams, body: adjustStockBody }), c.adjustStock);
  return router;
}
