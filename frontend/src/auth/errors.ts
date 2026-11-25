// Pérdida de sesión (spec 05 §15.6, §16.5): solo UNAUTHORIZED en una operación protegida. Se decide por `code`.
import { ApiError } from '../api/client';

export function isSessionLost(error: unknown, options: { auth: boolean }): boolean {
  return options.auth && error instanceof ApiError && error.code === 'UNAUTHORIZED';
}
