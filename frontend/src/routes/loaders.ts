// Loaders del router: aplican las decisiones puras de src/auth/guards.ts antes de mostrar cada pantalla (spec 05 §15.5, §16.2, §16.3).
import { redirect } from 'react-router';
import { markSessionLossHandled } from '../api/client';
import { resolveLoginAccess, resolveProtectedAccess, resolveUnknownRoute } from '../auth/guards';
import { sessionStore } from '../auth/session-store';

/** Ruta protegida: sin sesión o con sesión vencida redirige a /login sin llamar a la API. */
export function protectedLoader(): null {
  const decision = resolveProtectedAccess(sessionStore.getSession(), Date.now());
  if (decision.kind === 'allow') return null;
  if (decision.reason === 'expired') {
    // Expiración coordinada: el aviso viaja con la redirección y el cliente HTTP no vuelve a notificar.
    sessionStore.clearSession('expired');
    markSessionLossHandled();
  }
  throw redirect(decision.to);
}

export interface LoginLoaderData {
  /** true si se llega a /login tras detectar una sesión expirada (DP-05). */
  sessionExpired: boolean;
}

/** /login: con sesión válida redirige a /dashboard; si hay una sesión vencida, la limpia. */
export function loginLoader(): LoginLoaderData {
  const decision = resolveLoginAccess(sessionStore.getSession(), Date.now());
  if (decision.kind === 'redirect') throw redirect(decision.to);
  if (decision.clearExpired) {
    // Llegada directa con token vencido (§16.3 "Token vencido"): se limpia y se muestra el formulario sin aviso.
    sessionStore.clearSession('expired');
    sessionStore.consumeEndReason();
    markSessionLossHandled();
  }
  return { sessionExpired: sessionStore.consumeEndReason() === 'expired' };
}

/** Ruta desconocida o V2 (DP-07): destino según la sesión. */
export function unknownRouteLoader(): string {
  return resolveUnknownRoute(sessionStore.getSession(), Date.now());
}
