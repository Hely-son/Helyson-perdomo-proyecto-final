// Decisiones de acceso (spec 05 §15.5, §16.2, §16.3). Puras: no limpian la sesión ni llaman a la API.
import { isSessionValid, type Session } from './session';

export type ProtectedAccess =
  | { kind: 'allow' }
  | { kind: 'redirect'; to: '/login'; reason: 'none' | 'expired' };

export type LoginAccess = { kind: 'redirect'; to: '/dashboard' } | { kind: 'form'; clearExpired: boolean };

export function resolveProtectedAccess(session: Session | null, now: number): ProtectedAccess {
  if (session === null) return { kind: 'redirect', to: '/login', reason: 'none' };
  if (!isSessionValid(session, now)) return { kind: 'redirect', to: '/login', reason: 'expired' };
  return { kind: 'allow' };
}

export function resolveLoginAccess(session: Session | null, now: number): LoginAccess {
  if (isSessionValid(session, now)) return { kind: 'redirect', to: '/dashboard' };
  return { kind: 'form', clearExpired: session !== null };
}

export function resolveUnknownRoute(session: Session | null, now: number): '/dashboard' | '/login' {
  return isSessionValid(session, now) ? '/dashboard' : '/login';
}
