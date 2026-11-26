// TK-01.4 · montaje compartido de las pruebas de aceptación (spec 05 §15.6, §15.8, §16.2, §16.3; ESC-58).
// Matriz: docs/qa/TK-01.4-matrix.md. No es un archivo de pruebas (Jest solo ejecuta *.test.ts).
//
// Arranca la app REAL en Node, sin DOM: src/auth/session-store (instancia `sessionStore`), src/api/client y
// src/routes/router.ts con sus loaders y su manejador de pérdida de sesión. Solo se simula lo que Node no tiene:
//  - el almacenamiento del navegador (localStorage) y una ventana (EventTarget), instalados ANTES de importar el
//    almacén, para que `sessionStore` se cree como en el navegador. Las acciones de "otra pestaña" cambian el
//    almacenamiento sin pasar por sus métodos (no cuentan como escrituras de esta pestaña) y después emiten el evento
//    `storage`, como hace el navegador en las demás pestañas del mismo origen;
//  - createBrowserRouter (necesita window.history) se sustituye por createMemoryRouter con las rutas reales;
//    react-router 7 ejecuta ambos con createRouter(...).initialize(), así que los loaders iniciales corren igual;
//  - el loader padre real (protectedLoader) se envuelve solo para registrar su resultado, y /dashboard/products
//    recibe un loader hijo de prueba que llama a apiRequest({ auth: true }), como harán los loaders de datos de
//    TK-03.3, TK-04.3 y TK-06.4. El loader hijo registra el resultado y devuelve null (no lanza).
// Cada archivo de pruebas llama a bootApp una sola vez: cada arranque necesita una evaluación nueva de router.ts y el
// registro ESM de Jest no se puede reiniciar sin duplicar React.
import { afterAll, expect, jest } from '@jest/globals';
import type * as ReactRouter from 'react-router';
import type { Session } from '../../../src/auth/session';
import type { SessionStore } from '../../../src/auth/session-store';

export type Router = ReturnType<typeof ReactRouter.createMemoryRouter>;
type ClientModule = typeof import('../../../src/api/client');

export const KEY = 'medsupply.session';
export const EXPIRED_NOTICE = /sesi[oó]n[^.<]*expir/i;
/** Ruta del dashboard que recibe el loader hijo de prueba. */
export const CHILD_PATH = '/dashboard/products';

/** localStorage simulado: registra cada escritura hecha por ESTA pestaña. */
export class FakeLocalStorage {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.writes.push(`setItem ${key}`);
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.writes.push(`removeItem ${key}`);
    this.data.delete(key);
  }
  clear(): void {
    this.writes.push('clear');
    this.data.clear();
  }
}

/** Ventana simulada: cuenta los listeners de `storage` (addEventListener u onstorage). */
export class FakeWindow extends EventTarget {
  storageListenerRegistrations = 0;
  private storageHandler: ((event: Event) => void) | null = null;
  readonly localStorage: FakeLocalStorage;

  constructor(storage: FakeLocalStorage) {
    super();
    this.localStorage = storage;
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (type === 'storage') this.storageListenerRegistrations += 1;
    super.addEventListener(type, listener, options);
  }

  get onstorage(): ((event: Event) => void) | null {
    return this.storageHandler;
  }

  set onstorage(handler: ((event: Event) => void) | null) {
    if (handler !== null) this.storageListenerRegistrations += 1;
    this.storageHandler = handler;
  }

  /** Emite un evento `storage` con los campos de StorageEvent (Node no tiene StorageEvent). */
  fireStorage(init: { key: string | null; oldValue: string | null; newValue: string | null }): void {
    const event = new Event('storage');
    Object.defineProperties(event, {
      key: { value: init.key },
      oldValue: { value: init.oldValue },
      newValue: { value: init.newValue },
      storageArea: { value: this.localStorage },
      url: { value: 'http://127.0.0.1:5173/dashboard' },
    });
    this.dispatchEvent(event);
    this.storageHandler?.call(this, event);
  }
}

export interface FetchCall {
  url: string;
  authorization: string | null;
}

export interface Observations {
  /** Toda llamada a router.navigate (la del operador simulado y la del manejador de pérdida de sesión). */
  navigate: string[];
  fetch: FetchCall[];
  /** Resultados de los loaders envueltos, en orden: parent:start, parent:allow | parent:redirect <to>, child:… */
  loaders: string[];
  storeNotifications: number;
  /** location.key de cada llegada estable a /login. */
  loginArrivals: Set<string>;
}

export interface BootOptions {
  bootPath: string;
  /** Sesión guardada en el almacenamiento antes de arrancar (se hidrata como en el navegador). */
  stored?: Session | null;
  /** Se invoca una sola vez, justo después de la primera ejecución del loader padre. */
  afterFirstParentLoader?: () => void;
}

export interface App {
  router: Router;
  store: SessionStore;
  client: ClientModule;
  storage: FakeLocalStorage;
  win: FakeWindow;
  obs: Observations;
  /** Copia de `obs.loaders` tomada en cuanto createBrowserRouter devuelve (síncrono dentro de la creación). */
  loadersAtCreation: string[] | null;
  /** Error lanzado al importar src/routes/router.ts, si lo hubo. */
  bootError: unknown;
  childLoader: { enabled: boolean };
  /** Se invoca una vez tras la próxima ejecución del loader padre y se borra. */
  hooks: { afterNextParentLoader: (() => void) | null };
  respond(fn: () => Response | Promise<Response>): void;
  resetObservations(): void;
  settle(): Promise<void>;
  loginNotice(): unknown;
  renderLogin(): string;
  /** Aviso de expiración en el HTML de /login; si la app no está en /login devuelve la ruta (diff legible). */
  noticeInHtml(): boolean | string;
  protectedCalls(n: number): Promise<string[]>;
  otherTab: {
    logout(): void;
    clear(): void;
    login(session: Session): void;
    setOtherKey(): void;
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
export const ok = () => jsonResponse(200, { data: [] });
export const unauthorized = () =>
  jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Sesión no válida o expirada.' } });

export function makeSession(expiresInMs: number, token: string): Session {
  return { token, expiresAt: new Date(Date.now() + expiresInMs).toISOString(), operatorName: 'Operadora QA' };
}

/** Avanza el reloj de la app más allá de `expiresAt` (Date.now, que usan los guards y el cliente). */
export function expireNow(session: Session): void {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(session.expiresAt) + 60_000);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

export async function bootApp(options: BootOptions): Promise<App> {
  const obs: Observations = { navigate: [], fetch: [], loaders: [], storeNotifications: 0, loginArrivals: new Set() };
  const childLoader = { enabled: true };
  const hooks: App['hooks'] = { afterNextParentLoader: null };
  let respond: () => Response | Promise<Response> = ok;
  let loadersAtCreation: string[] | null = null;
  let firstParentDone = false;

  // 1. Navegador simulado, antes de importar el almacén.
  const storage = new FakeLocalStorage();
  if (options.stored) storage.data.set(KEY, JSON.stringify(options.stored));
  const win = new FakeWindow(storage);
  const g = globalThis as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries({
    window: win,
    localStorage: storage,
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    dispatchEvent: win.dispatchEvent.bind(win),
  })) {
    Object.defineProperty(g, name, { configurable: true, writable: true, value });
  }

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    obs.fetch.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization') });
    return respond();
  }) as typeof fetch;

  // Solo se filtra el aviso de React al renderizar en el servidor (useLayoutEffect de useNavigate).
  const realConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    realConsoleError(...args);
  };
  afterAll(() => {
    globalThis.fetch = realFetch;
    console.error = realConsoleError;
  });

  // 2. createBrowserRouter → createMemoryRouter con las rutas reales instrumentadas.
  let client: ClientModule | null = null;
  const childLoaderFn = () => {
    if (!childLoader.enabled) return null;
    obs.loaders.push('child:start');
    let pending: Promise<unknown>;
    try {
      pending = (client as ClientModule).apiRequest('/products', { auth: true });
    } catch (error) {
      obs.loaders.push(`child:sync-throw ${errorName(error)}`);
      return null;
    }
    return pending.then(
      () => {
        obs.loaders.push('child:ok');
        return null;
      },
      (error: unknown) => {
        obs.loaders.push(`child:${errorName(error)}`);
        // Diagnóstico opcional (QA_DIAG=1): mensaje del error del loader hijo; no interviene en las aserciones.
        if (process.env.QA_DIAG === '1') process.stderr.write(`[QA_DIAG] child loader: ${String(error)}\n`);
        return null;
      },
    );
  };

  const instrument = (routes: ReactRouter.RouteObject[]): ReactRouter.RouteObject[] =>
    routes.map((route) => {
      if (route.children === undefined) return route;
      const parentLoader = route.loader as (args: unknown) => unknown;
      const afterParent = () => {
        if (!firstParentDone) {
          firstParentDone = true;
          options.afterFirstParentLoader?.();
        }
        const next = hooks.afterNextParentLoader;
        hooks.afterNextParentLoader = null;
        next?.();
      };
      return {
        ...route,
        loader: (args: unknown) => {
          obs.loaders.push('parent:start');
          try {
            const value = parentLoader(args);
            obs.loaders.push('parent:allow');
            return value;
          } catch (thrown) {
            obs.loaders.push(
              thrown instanceof Response
                ? `parent:redirect ${thrown.headers.get('Location')}`
                : `parent:throw ${errorName(thrown)}`,
            );
            throw thrown;
          } finally {
            afterParent();
          }
        },
        children: route.children.map((child) => (child.path === CHILD_PATH ? { ...child, loader: childLoaderFn } : child)),
      } as ReactRouter.RouteObject;
    });

  const actual = await import('react-router');
  jest.unstable_mockModule('react-router', () => ({
    ...actual,
    createBrowserRouter: (routes: ReactRouter.RouteObject[]) => {
      const created = actual.createMemoryRouter(instrument(routes), { initialEntries: [options.bootPath] });
      loadersAtCreation = [...obs.loaders];
      const original = created.navigate.bind(created);
      created.navigate = ((to: unknown, opts?: unknown) => {
        obs.navigate.push(String(to));
        return (original as (t: unknown, o?: unknown) => Promise<void>)(to, opts);
      }) as typeof created.navigate;
      return created;
    },
  }));

  // 3. Arranque de la app, en el orden del navegador: almacén (hidratación), cliente y router.
  const { sessionStore: store } = await import('../../../src/auth/session-store');
  store.subscribe(() => {
    obs.storeNotifications += 1;
  });
  client = await import('../../../src/api/client');
  let router = undefined as unknown as Router;
  let bootError: unknown = undefined;
  try {
    router = (await import('../../../src/routes/router')).router as unknown as Router;
  } catch (error) {
    bootError = error;
  }
  const { RouterProvider } = await import('react-router');
  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');
  router?.subscribe((state) => {
    if (state.navigation.state === 'idle' && state.location.pathname === '/login') obs.loginArrivals.add(state.location.key);
  });
  const loadedClient = client;

  /** HTML de la app en el estado actual; exige que sea la pantalla de login (formulario visible). */
  const renderLogin = (): string => {
    const html = renderToString(createElement(RouterProvider, { router: router as never }));
    expect(html).toContain('Contraseña');
    expect(html).toContain('Iniciar sesión');
    return html;
  };

  const fireFromOtherTab = (key: string | null, mutate: () => void) => {
    const oldValue = key === null ? null : storage.getItem(key);
    mutate();
    win.fireStorage({ key, oldValue, newValue: key === null ? null : storage.getItem(key) });
  };

  return {
    router,
    store,
    client: loadedClient,
    storage,
    win,
    obs,
    get loadersAtCreation() {
      return loadersAtCreation;
    },
    bootError,
    childLoader,
    hooks,
    respond(fn) {
      respond = fn;
    },
    resetObservations() {
      obs.navigate.length = 0;
      obs.fetch.length = 0;
      obs.loaders.length = 0;
      obs.storeNotifications = 0;
      obs.loginArrivals.clear();
      storage.writes.length = 0;
    },
    /** Espera a que no haya navegación en curso durante varios ciclos seguidos. */
    async settle() {
      let stable = 0;
      for (let i = 0; i < 200 && stable < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        stable = router.state.navigation.state === 'idle' && router.state.initialized ? stable + 1 : 0;
      }
    },
    loginNotice() {
      const match = router.state.matches.find((m) => m.route.path === '/login');
      return match === undefined
        ? undefined
        : (router.state.loaderData[match.route.id] as { sessionExpired?: unknown })?.sessionExpired;
    },
    renderLogin,
    noticeInHtml() {
      const path = router.state.location.pathname;
      if (path !== '/login') return `no está en /login: ${path}`;
      return EXPIRED_NOTICE.test(renderLogin());
    },
    protectedCalls(n) {
      return Promise.allSettled(
        Array.from({ length: n }, () => loadedClient.apiRequest('/products', { auth: true })),
      ).then((rs) => rs.map((r) => (r.status === 'fulfilled' ? 'ok' : errorName(r.reason))));
    },
    otherTab: {
      logout: () => fireFromOtherTab(KEY, () => storage.data.delete(KEY)),
      clear: () => fireFromOtherTab(null, () => storage.data.clear()),
      login: (session) => fireFromOtherTab(KEY, () => storage.data.set(KEY, JSON.stringify(session))),
      setOtherKey: () => fireFromOtherTab('otra.clave', () => storage.data.set('otra.clave', '1')),
    },
  };
}
