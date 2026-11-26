// Almacén de la sesión: memoria + almacenamiento (localStorage en el navegador), spec 05 §15.7.
import { parseStoredSession, type Session } from './session';

export const SESSION_STORAGE_KEY = 'medsupply.session';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SessionEndReason = 'expired' | 'logout' | 'unauthorized';

export interface SessionStore {
  getSession(): Session | null;
  setSession(session: Session): void;
  clearSession(reason: SessionEndReason): void;
  subscribe(listener: () => void): () => void;
  /** Devuelve el motivo del último cierre una sola vez. */
  consumeEndReason(): SessionEndReason | null;
  /**
   * Cambio de almacenamiento hecho por otra pestaña (§15.8, ESC-58). Solo invalida la memoria; nunca escribe ni
   * elimina en el almacenamiento compartido y no adopta sesiones ajenas.
   */
  syncExternalChange(key: string | null): void;
}

export function createSessionStore(storage: StorageLike): SessionStore {
  const listeners = new Set<() => void>();
  let endReason: SessionEndReason | null = null;

  const safe = <T>(action: () => T, fallback: T): T => {
    try {
      return action();
    } catch {
      return fallback;
    }
  };

  const raw = safe(() => storage.getItem(SESSION_STORAGE_KEY), null);
  let current = parseStoredSession(raw);
  if (raw !== null && current === null) safe(() => storage.removeItem(SESSION_STORAGE_KEY), undefined);

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getSession: () => current,
    setSession(session) {
      current = session;
      endReason = null;
      safe(() => storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session)), undefined);
      notify();
    },
    clearSession(reason) {
      if (current === null) return;
      current = null;
      endReason = reason;
      safe(() => storage.removeItem(SESSION_STORAGE_KEY), undefined);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    syncExternalChange(key) {
      if (key !== null && key !== SESSION_STORAGE_KEY) return;
      if (current === null) return;
      const stored = parseStoredSession(safe(() => storage.getItem(SESSION_STORAGE_KEY), null));
      if (stored !== null && stored.token === current.token) return;
      current = null;
      endReason = 'logout';
      notify();
    },
    consumeEndReason() {
      const reason = endReason;
      endReason = null;
      return reason;
    },
  };
}

function browserStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Acceso denegado al almacenamiento: se usa solo la memoria.
  }
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

export const sessionStore: SessionStore = createSessionStore(browserStorage());

// Una sola suscripción por instancia del navegador; en Node/Jest sin ventana no se registra.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    sessionStore.syncExternalChange(event.key);
  });
}
