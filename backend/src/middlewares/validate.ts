import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../lib/app-error';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

const PARTS = ['params', 'query', 'body'] as const;

/**
 * Middleware de validación con Zod. Sustituye req.body, req.query y req.params por la salida
 * del esquema. Si alguna parte no cumple, responde 422 VALIDATION_ERROR sin detalles ni valores.
 *
 * En Express 5 `req.query` es un getter del prototipo y no admite asignación: se define una
 * propiedad propia en la instancia con Object.defineProperty, que tiene prioridad sobre el getter.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return async (req, _res, next) => {
    const parsed: Partial<Record<(typeof PARTS)[number], unknown>> = {};
    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = await schema.safeParseAsync(req[part]);
      if (!result.success) {
        next(new AppError(422, 'VALIDATION_ERROR', `La petición no cumple el esquema (${part}).`));
        return;
      }
      parsed[part] = result.data;
    }
    for (const part of PARTS) {
      if (!(part in parsed)) continue;
      Object.defineProperty(req, part, {
        value: parsed[part],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    next();
  };
}
