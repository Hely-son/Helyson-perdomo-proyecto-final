import {
  SESSION_STORAGE_KEY,
  createSessionStore,
  type StorageLike,
} from '../../src/auth/session-store';
import type { Session } from '../../src/auth/session';

// TK-01.2 · spec 05 §15.4 (DP-05), §15.7, §15.8, §15.6. Matriz: docs/qa/TK-01.2-matrix.md.
// El token vive en memoria y en el almacenamiento (localStorage en el navegador) bajo una clave fija.
// La clave y el formato JSON { token, expiresAt, operatorName } los usan también los E2E (e2e/support).

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const session: Session = {
  token: 'token-de-prueba',
  expiresAt: '2099-01-01T00:00:00.000Z',
  operatorName: 'Operadora de Prueba',
};

describe('QA-01.2-03 (§15.7, §15.8, DP-05): almacén de la sesión', () => {
  it('la clave fija del almacenamiento es "medsupply.session"', () => {
    expect(SESSION_STORAGE_KEY).toBe('medsupply.session');
  });

  it('sin nada guardado, no hay sesión', () => {
    const store = createSessionStore(new MemoryStorage());
    expect(store.getSession()).toBeNull();
  });

  it('hidrata desde el almacenamiento una sesión guardada (sobrevive a la recarga, §15.7)', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    expect(createSessionStore(storage).getSession()).toEqual(session);
  });

  it('hidrata también una sesión vencida: la vigencia la deciden los guards y el cliente', () => {
    const storage = new MemoryStorage();
    const expired = { ...session, expiresAt: '2000-01-01T00:00:00.000Z' };
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(expired));
    expect(createSessionStore(storage).getSession()).toEqual(expired);
  });

  it('un valor corrupto al hidratar se elimina del almacenamiento y no hay sesión', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_STORAGE_KEY, '{corrupto');
    const store = createSessionStore(storage);
    expect(store.getSession()).toBeNull();
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('setSession guarda en memoria y en el almacenamiento como JSON { token, expiresAt, operatorName }', () => {
    const storage = new MemoryStorage();
    const store = createSessionStore(storage);
    store.setSession(session);
    expect(store.getSession()).toEqual(session);
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(session);
  });

  it('setSession notifica a los suscriptores; tras desuscribirse ya no', () => {
    const store = createSessionStore(new MemoryStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.setSession(session);
    expect(calls).toBe(1);
    unsubscribe();
    store.clearSession('logout');
    expect(calls).toBe(1);
  });

  it.each(['expired', 'logout', 'unauthorized'] as const)(
    'clearSession(%s) descarta la sesión de memoria y del almacenamiento',
    (reason) => {
      const storage = new MemoryStorage();
      const store = createSessionStore(storage);
      store.setSession(session);
      store.clearSession(reason);
      expect(store.getSession()).toBeNull();
      expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    },
  );

  it('clearSession descarta también una sesión hidratada del almacenamiento', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    const store = createSessionStore(storage);
    store.clearSession('expired');
    expect(store.getSession()).toBeNull();
    expect(storage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('clearSession es idempotente y solo notifica si había sesión', () => {
    const store = createSessionStore(new MemoryStorage());
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.clearSession('logout');
    expect(calls).toBe(0);

    store.setSession(session);
    calls = 0;
    store.clearSession('unauthorized');
    store.clearSession('unauthorized');
    store.clearSession('expired');
    expect(calls).toBe(1);
    expect(store.getSession()).toBeNull();
  });

  it('el motivo del cierre se consume una sola vez (aviso de sesión expirada, §16.3)', () => {
    const store = createSessionStore(new MemoryStorage());
    expect(store.consumeEndReason()).toBeNull();
    store.setSession(session);
    store.clearSession('expired');
    expect(store.consumeEndReason()).toBe('expired');
    expect(store.consumeEndReason()).toBeNull();
  });

  it.each(['logout', 'unauthorized'] as const)('el motivo %s también se informa una sola vez', (reason) => {
    const store = createSessionStore(new MemoryStorage());
    store.setSession(session);
    store.clearSession(reason);
    expect(store.consumeEndReason()).toBe(reason);
    expect(store.consumeEndReason()).toBeNull();
  });
});
