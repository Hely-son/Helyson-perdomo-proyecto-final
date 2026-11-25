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
import { healthRouter } from './modules/health/health.routes';
import { createProductsRouter } from './modules/products/products.routes';
import { createProductService } from './modules/products/products.service';

export interface CreateAppOptions {
  auth: AuthOptions;
  prisma: PrismaClient;
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
  app.use(`${API_PREFIX}/products`, createProductsRouter(createProductService({ prisma: options.prisma })));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
