import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error';

// Ruta o método inexistente (A6): 404 NOT_FOUND.
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'La ruta no existe.'));
};
