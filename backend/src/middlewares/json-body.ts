import express from 'express';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error';

// Parser JSON con el límite por defecto de Express (100 kB, < 1 MB). `strict: false` acepta
// JSON primitivo para que sea el esquema Zod quien lo rechace con 422 (A8). Cualquier fallo
// del parser (sintaxis, tamaño, charset, codificación, petición abortada) se traduce a 400.
const parser = express.json({ strict: false });

export const jsonBody: RequestHandler = (req, res, next) => {
  parser(req, res, (err?: unknown) => {
    if (err) {
      next(new AppError(400, 'MALFORMED_REQUEST', 'El cuerpo de la petición no es JSON válido.'));
      return;
    }
    next();
  });
};
