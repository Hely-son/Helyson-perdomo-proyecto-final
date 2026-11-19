import express from 'express';
import type { Express, Router } from 'express';
import { errorHandler } from './middlewares/error-handler';
import { jsonBody } from './middlewares/json-body';
import { notFound } from './middlewares/not-found';
import { healthRouter } from './modules/health/health.routes';

export interface CreateAppOptions {
  // Solo para pruebas: server.ts nunca lo pasa.
  testRouter?: Router;
}

const API_PREFIX = '/api/v1';

/** Construye la aplicación sin escuchar. */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(jsonBody);
  app.use(API_PREFIX, healthRouter);
  if (options.testRouter) {
    app.use(API_PREFIX, options.testRouter);
  }
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
