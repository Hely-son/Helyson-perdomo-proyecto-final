import type { RequestHandler } from 'express';
import { AppError } from '../lib/app-error';
import { verifyAccessToken } from '../modules/auth/token';

// Autenticación Bearer JWT (TK-01.1, D2; spec 05 §15.4). Sin estado: no consulta la base.

/** Devuelve el token de "Bearer <token>" (un solo token) o null. */
export function parseBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match ? match[1] : null;
}

export function requireAuth(jwtSecret: string): RequestHandler {
  return (req, _res, next) => {
    const token = parseBearerToken(req.header('authorization'));
    if (token === null || verifyAccessToken(token, jwtSecret) === null) {
      next(new AppError(401, 'UNAUTHORIZED', 'Sesión no válida o expirada.'));
      return;
    }
    next();
  };
}
