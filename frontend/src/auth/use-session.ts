import { useSyncExternalStore } from 'react';
import type { Session } from './session';
import { sessionStore } from './session-store';

/** Sesión actual como estado de React (suscripción al almacén, spec 05 §15.7). */
export function useSession(): Session | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getSession);
}
