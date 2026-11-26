import type { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/app-error';

// El router de Express 5 (router 2.x, decodeParam) lanza un URIError con status 400 cuando un
// parámetro de ruta no se puede decodificar. Su mensaje incluye el valor recibido: no se reenvía.
function isParamDecodeError(err: unknown): boolean {
  return err instanceof URIError && (err as URIError & { status?: unknown }).status === 400;
}

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

// Manejador global: cuerpo exactamente { error: { code, message } }. Un error no controlado
// responde 500 con mensaje genérico, sin stack ni el mensaje original.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (isParamDecodeError(err)) {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Un parámetro de ruta no tiene una codificación válida.' },
    });
    return;
  }
  // Registro mínimo: solo nombre del error, método y ruta sin query. Nunca message, stack, cause ni detalles.
  const name = err instanceof Error ? err.name : 'UnknownError';
  // Los segmentos con forma de UUID (p. ej. el sessionId del chat, una credencial) se enmascaran como :id.
  const path = `${req.baseUrl}${req.path}`.replace(UUID_SEGMENT, '/:id');
  process.stderr.write(`${name} ${req.method} ${path}\n`);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' } });
};
