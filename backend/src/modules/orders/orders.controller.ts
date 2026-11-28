import type { Request, RequestHandler } from 'express';
import type { ListOrdersInput, OrderService } from './orders.service';

// Los parámetros ya fueron validados y convertidos por orderIdParams.
const idOf = (req: Request) => (req.params as unknown as { orderId: number }).orderId;

export interface OrderController {
  list: RequestHandler;
  get: RequestHandler;
  changeStatus: RequestHandler;
}

export function createOrderController(service: OrderService): OrderController {
  return {
    list: async (req, res) => {
      res.status(200).json(await service.listOrders(req.query as unknown as ListOrdersInput));
    },
    get: async (req, res) => {
      res.status(200).json(await service.getOrder(idOf(req)));
    },
    changeStatus: async (req, res) => {
      const { status } = req.body as { status: string };
      await service.changeOrderStatus(idOf(req), status);
      // D1: el detalle sale de una lectura posterior al cambio.
      res.status(200).json(await service.getOrder(idOf(req)));
    },
  };
}
