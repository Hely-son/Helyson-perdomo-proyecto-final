import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { createProductController } from './products.controller';
import { adjustStockBody, createProductBody, productIdParams, updateProductBody } from './products.schemas';
import type { ProductService } from './products.service';

// Sin borrado ni reactivación (RN-10, ESC-08, ESC-33). Se monta bajo /api/v1/products con rutas relativas; las rutas
// fijas (/alerts, TK-04.1) deben registrarse antes que /:productId.
export function createProductsRouter(service: ProductService): Router {
  const c = createProductController(service);
  const router = Router();
  router.get('/', c.list);
  router.get('/alerts', c.listStockAlerts);
  router.post('/', validate({ body: createProductBody }), c.create);
  router.get('/:productId', validate({ params: productIdParams }), c.get);
  router.patch('/:productId', validate({ params: productIdParams, body: updateProductBody }), c.update);
  router.post('/:productId/deactivate', validate({ params: productIdParams }), c.deactivate);
  router.patch('/:productId/stock', validate({ params: productIdParams, body: adjustStockBody }), c.adjustStock);
  return router;
}
