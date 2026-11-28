import express from 'express';
import type { Express, Router } from 'express';
import { errorHandler } from './middlewares/error-handler';
import { jsonBody } from './middlewares/json-body';
import { notFound } from './middlewares/not-found';
import { requireAuth } from './middlewares/require-auth';
import type { PrismaClient } from './generated/prisma/client';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createAuthService } from './modules/auth/auth.service';
import type { AuthOptions } from './modules/auth/token';
import { createChatRouter } from './modules/chat/chat.routes';
import { createChatService } from './modules/chat/chat.service';
import type { Cart, ChatProducts, ConversationState } from './modules/chat/chat-fsm';
import { ChatSessionStore } from './modules/chat/session-store';
import { healthRouter } from './modules/health/health.routes';
import { createProductsRouter } from './modules/products/products.routes';
import { createProductService } from './modules/products/products.service';
import { createOrdersRouter } from './modules/orders/orders.routes';
import { createOrderService } from './modules/orders/orders.service';
import type { ConfirmedOrder, OrderService } from './modules/orders/orders.service';

export interface CreateAppOptions {
  auth: AuthOptions;
  prisma: PrismaClient;
  // Almacén de sesiones de chat; si no se inyecta se crea uno propio (TTL 30, sin barrido).
  chatSessionStore?: ChatSessionStore<ConversationState, Cart>;
  // Servicio de productos que consume el chat; si no se inyecta se usa el real (createProductService).
  chatProducts?: ChatProducts;
  // Servicio de pedidos que consume el chat (confirmación y "Mis pedidos"); por defecto el real (createOrderService).
  chatOrders?: Pick<OrderService, 'confirmOrder' | 'findCustomerOrder'>;
  // Construye los textos del pedido confirmado (TK-05.6, D-C); por defecto, número de orden y estado.
  chatConfirmedOrderMessage?: (order: ConfirmedOrder) => string[];
  // Solo para pruebas: server.ts nunca lo pasa.
  testRouter?: Router;
}

const API_PREFIX = '/api/v1';

/** Construye la aplicación sin escuchar. */
export function createApp(options: CreateAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(jsonBody);
  app.use(API_PREFIX, healthRouter);
  app.use(API_PREFIX, createAuthRouter(createAuthService({ prisma: options.prisma, auth: options.auth })));
  // Rutas protegidas (spec 05 §15.4): el prefijo cubre sus subrutas y va antes de testRouter.
  app.use([`${API_PREFIX}/products`, `${API_PREFIX}/orders`], requireAuth(options.auth.jwtSecret));
  if (options.testRouter) {
    app.use(API_PREFIX, options.testRouter);
  }
  const productService = createProductService({ prisma: options.prisma });
  app.use(`${API_PREFIX}/products`, createProductsRouter(productService));
  app.use(`${API_PREFIX}/orders`, createOrdersRouter(createOrderService({ prisma: options.prisma })));
  const chatStore = options.chatSessionStore ?? new ChatSessionStore<ConversationState, Cart>({ ttlMinutes: 30 });
  app.use(`${API_PREFIX}/chat`, createChatRouter(createChatService({
        db: options.prisma,
        store: chatStore,
        products: options.chatProducts ?? productService,
        orders: options.chatOrders ?? createOrderService({ prisma: options.prisma }),
        confirmedOrderMessage: options.chatConfirmedOrderMessage,
      }),));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
