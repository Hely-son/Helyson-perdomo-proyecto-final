import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { createOrderController } from './orders.controller';
import { changeOrderStatusBody, listOrdersQuery, orderIdParams } from './orders.schemas';
import type { OrderService } from './orders.service';

// Se monta bajo /api/v1/orders con rutas relativas, detrás de requireAuth.
export function createOrdersRouter(service: OrderService): Router {
  const c = createOrderController(service);
  const router = Router();
  router.get('/', validate({ query: listOrdersQuery }), c.list);
  router.get('/:orderId', validate({ params: orderIdParams }), c.get);
  router.patch('/:orderId/status', validate({ params: orderIdParams, body: changeOrderStatusBody }), c.changeStatus);
  return router;
}
