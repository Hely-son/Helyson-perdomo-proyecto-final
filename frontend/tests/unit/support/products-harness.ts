// TK-03.3 · montaje de las pruebas de aceptación de /dashboard/products (spec 02 F-1..F-5, §9; spec 05 §16.4, §16.5).
// Matriz: docs/qa/TK-03.3-matrix.md. No es un archivo de pruebas (Jest solo ejecuta *.test.ts).
//
// A diferencia de app-harness.ts (TK-01.4), aquí /dashboard/products conserva su loader REAL: se prueba la pantalla
// de punta a punta en Node, sin DOM, a través del router real de src/routes/router.ts. Solo se simula:
//  - localStorage y una ventana (clases de app-harness.ts, importadas sin modificarlas), antes de importar el almacén;
//  - fetch, con un manejador por petición (método y ruta relativa a la URL base del API) que registra cada llamada;
//  - createBrowserRouter → createMemoryRouter con las rutas reales (no se envuelve ningún loader);
//  - useSession (src/auth/use-session.ts) por un equivalente con getServerSnapshot, que renderToString exige.
// El HTML se obtiene con renderToString dentro de ConfigProvider (es_ES) y App de antd, como en src/main.tsx.
// Los módulos de producción nuevos de TK-03.3 se cargan con loadModule (especificador construido en ejecución): así
// cada prueba falla por su cuenta mientras no existan, en lugar de romper la compilación de todo el archivo.
import { afterAll, jest } from '@jest/globals';
import type * as ReactRouter from 'react-router';
import type { Session } from '../../../src/auth/session';
import type { SessionStore } from '../../../src/auth/session-store';
import { FakeLocalStorage, FakeWindow, KEY, jsonResponse } from './app-harness';

export type Router = ReturnType<typeof ReactRouter.createMemoryRouter>;
type ClientModule = typeof import('../../../src/api/client');
type LoadersModule = typeof import('../../../src/routes/loaders');

export const PRODUCTS_PATH = '/dashboard/products';

// ── Contrato observable de la pantalla (fijado en docs/qa/TK-03.3-matrix.md, "Contrato de interfaz") ─────────────
/** Clase de la fila resaltada (stock crítico). Las filas llevan data-row-key="<id>" (Table de antd con rowKey="id"). */
export const CRITICAL_ROW_CLASS = 'is-stock-critical';
/**
 * Indicador de carga activo: Spin de antd girando (también Table con loading), Skeleton, aria-busy o un texto "Cargando".
 * No basta "ant-spin": la Table de antd siempre envuelve su contenido en ant-spin-nested-loading, aunque no cargue.
 */
export const LOADING = /ant-spin-spinning|ant-skeleton|aria-busy="true"|cargando/i;
/** Catálogo vacío (ESC-41). */
export const EMPTY_CATALOG = /cat[aá]logo[^<]*vac[ií]o|no hay productos/i;
/** Error técnico de la pantalla (ESC-42, §16.4 "Error técnico"). */
export const TECHNICAL_ERROR = /no se pudo cargar el cat[aá]logo|no se pudieron cargar los productos/i;
/** Aviso de indicador de stock crítico no disponible (ESC-53, §16.4). */
export const ALERTS_UNAVAILABLE = /stock cr[ií]tico[^<]*no (?:est[aá] )?disponible/i;

export interface ApiCall {
  method: string;
  /** Ruta relativa a la URL base del API, sin query: p. ej. /products/7/stock. */
  path: string;
  url: string;
  authorization: string | null;
  body: unknown;
}

export type Responder = (call: ApiCall) => Response | Promise<Response>;

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string;
  currentStock: number;
  minStockAlert: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Producto con la forma del schema Product de docs/openapi.yaml. */
export function product(id: number, name: string, currentStock: number, minStockAlert: number, isActive = true): Product {
  return {
    id,
    name,
    description: null,
    price: '1250.00',
    currentStock,
    minStockAlert,
    isActive,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  };
}

export const list = (items: readonly Product[]) => jsonResponse(200, { items });
export const apiError = (status: number, code: string, message: string) => jsonResponse(status, { error: { code, message } });
export const internalError = (message = 'Error interno del servidor.') => apiError(500, 'INTERNAL_ERROR', message);
/** Una respuesta que no llega nunca (o hasta que el test la libere). */
export function deferred(): { promise: Promise<Response>; resolve: (r: Response) => void } {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export function makeSession(expiresInMs: number, token: string): Session {
  return { token, expiresAt: new Date(Date.now() + expiresInMs).toISOString(), operatorName: 'Operadora QA' };
}

/** Etiqueta de apertura de la fila de la tabla con data-row-key="<id>", o null si no está en el HTML. */
export function rowTag(html: string, id: number): string | null {
  const tags = html.match(/<tr\b[^>]*>/g) ?? [];
  return tags.find((tag) => tag.includes(`data-row-key="${id}"`)) ?? null;
}

/** Resaltado de cada id: true/false si la fila existe, 'ausente' si no se renderizó. */
export function highlightOf(html: string, ids: readonly number[]): Record<number, boolean | 'ausente'> {
  const out: Record<number, boolean | 'ausente'> = {};
  for (const id of ids) {
    const tag = rowTag(html, id);
    out[id] = tag === null ? 'ausente' : new RegExp(`class="[^"]*\\b${CRITICAL_ROW_CLASS}\\b`).test(tag);
  }
  return out;
}

/** HTML de la fila (desde su <tr> hasta el </tr> siguiente), o null. */
export function rowHtml(html: string, id: number): string | null {
  const tag = rowTag(html, id);
  if (tag === null) return null;
  const start = html.indexOf(tag);
  const end = html.indexOf('</tr>', start);
  return html.slice(start, end === -1 ? undefined : end);
}

/** Manejador por "MÉTODO /ruta". Una petición no prevista responde 500 con un código propio de QA (visible en el fallo). */
export function byRoute(table: Record<string, (call: ApiCall) => Response | Promise<Response>>): Responder {
  return (call) => {
    const handler = table[`${call.method} ${call.path}`];
    return handler === undefined ? apiError(500, 'QA_UNEXPECTED_REQUEST', `${call.method} ${call.path}`) : handler(call);
  };
}

/** "MÉTODO /ruta" de cada llamada registrada. */
export const callKeys = (calls: readonly ApiCall[]) => calls.map((c) => `${c.method} ${c.path}`);

// ── Contrato de los módulos nuevos (docs/qa/TK-03.3-matrix.md). Las pruebas puras los importan con sus tipos reales;
//    estas firmas solo tipan la carga dinámica de las pruebas de integración. ─────────────────────────────────────
export type ProductErrorOutcome =
  | { kind: 'session' }
  | { kind: 'validation'; message: string }
  | { kind: 'conflict'; message: string; reloadLists: true }
  | { kind: 'not-found'; message: string; reloadLists: true }
  | { kind: 'technical'; message: string };

export type ProductActionResult<T> = { ok: true; value: T } | { ok: false; error: ProductErrorOutcome };

export interface ProductsApiModule {
  listProducts(): Promise<{ items: Product[] }>;
  listStockAlerts(): Promise<{ items: Product[] }>;
  getProduct(id: number): Promise<Product>;
  createProduct(body: Record<string, unknown>): Promise<Product>;
  updateProduct(id: number, body: Record<string, unknown>): Promise<Product>;
  deactivateProduct(id: number): Promise<Product>;
  adjustProductStock(id: number, body: { newStock: number; expectedStock: number }): Promise<Product>;
}

export interface InventoryModule {
  criticalProductIds(products: readonly Product[], alerts: readonly Product[] | null): ReadonlySet<number>;
  buildAdjustStockRequest(shown: Pick<Product, 'currentStock'>, newStock: number): { newStock: number; expectedStock: number };
  classifyProductError(error: unknown): ProductErrorOutcome;
  runProductAction<T>(action: () => Promise<T>, reloadLists: () => unknown): Promise<ProductActionResult<T>>;
}

export const loadProductsApi = () => loadModule<ProductsApiModule>('api/products');
export const loadInventory = () => loadModule<InventoryModule>('products/inventory');

/** Carga un módulo de producción por ruta relativa a src/ (p. ej. 'api/products'); falla con el motivo si no existe. */
export async function loadModule<T>(fromSrc: string): Promise<T> {
  const specifier = ['..', '..', '..', 'src', fromSrc].join('/');
  return (await import(specifier)) as T;
}

export interface ProductsApp {
  router: Router;
  store: SessionStore;
  client: ClientModule;
  loaders: LoadersModule;
  storage: FakeLocalStorage;
  /** Toda llamada a router.navigate (la del operador simulado y la del manejador de pérdida de sesión). */
  navigate: string[];
  calls: ApiCall[];
  bootError: unknown;
  respond(fn: Responder): void;
  reset(): void;
  settle(): Promise<void>;
  /** Unos ciclos del bucle de eventos, sin esperar a que termine la navegación. */
  ticks(n?: number): Promise<void>;
  render(): string;
  loginNotice(): unknown;
  /** Ruta del árbol real: la ruta hija con path y el padre que la contiene. */
  findRoute(path: string): { parent: ReactRouter.RouteObject; child: ReactRouter.RouteObject } | null;
}

export interface ProductsBootOptions {
  bootPath: string;
  stored?: Session | null;
  /** Manejador de fetch desde el arranque (los loaders iniciales corren dentro de createBrowserRouter). */
  responder?: Responder;
}

/** Arranca la app real. Llamar una sola vez por archivo (una evaluación de router.ts por registro de módulos). */
export async function bootProductsApp(options: ProductsBootOptions): Promise<ProductsApp> {
  const navigate: string[] = [];
  const calls: ApiCall[] = [];
  let respond: Responder =
    options.responder ?? (() => jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'sin respuesta de prueba' } }));

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
    const url = String(input);
    const base = url.indexOf('/api/v1');
    const rel = base === -1 ? url : url.slice(base + '/api/v1'.length);
    const raw = init?.body;
    let body: unknown = undefined;
    if (typeof raw === 'string') {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const call: ApiCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: rel.split('?')[0],
      url,
      authorization: new Headers(init?.headers).get('Authorization'),
      body,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;

  const realConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const first = String(args[0]);
    // Avisos propios de renderToString (no de la app): useLayoutEffect en el servidor.
    if (first.includes('useLayoutEffect does nothing on the server')) return;
    realConsoleError(...args);
  };
  afterAll(() => {
    globalThis.fetch = realFetch;
    console.error = realConsoleError;
  });

  const actual = await import('react-router');
  jest.unstable_mockModule('react-router', () => ({
    ...actual,
    createBrowserRouter: (routes: ReactRouter.RouteObject[], opts?: Parameters<typeof actual.createMemoryRouter>[1]) => {
      const created = actual.createMemoryRouter(routes, { ...opts, initialEntries: [options.bootPath] });
      const original = created.navigate.bind(created);
      created.navigate = ((to: unknown, o?: unknown) => {
        navigate.push(String(to));
        return (original as (t: unknown, x?: unknown) => Promise<void>)(to, o);
      }) as typeof created.navigate;
      return created;
    },
  }));

  // renderToString exige getServerSnapshot en useSyncExternalStore (React 18); src/auth/use-session.ts no lo pasa porque
  // la app solo se renderiza en el navegador. Se sustituye por un equivalente que lee el mismo almacén real también como
  // instantánea del servidor. El layout real (DashboardLayout) se renderiza sin otros cambios.
  jest.unstable_mockModule('../../../src/auth/use-session', async () => {
    const { useSyncExternalStore } = await import('react');
    const { sessionStore } = await import('../../../src/auth/session-store');
    return {
      useSession: () => useSyncExternalStore(sessionStore.subscribe, sessionStore.getSession, sessionStore.getSession),
    };
  });

  const { sessionStore: store } = await import('../../../src/auth/session-store');
  const client = await import('../../../src/api/client');
  const loaders = await import('../../../src/routes/loaders');
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
  const { App: AntApp, ConfigProvider } = await import('antd');
  const esES = (await import('antd/locale/es_ES')).default;

  const findRoute = (path: string) => {
    const walk = (routes: readonly ReactRouter.RouteObject[]): { parent: ReactRouter.RouteObject; child: ReactRouter.RouteObject } | null => {
      for (const route of routes) {
        const child = route.children?.find((c) => c.path === path);
        if (child !== undefined) return { parent: route, child };
        const deeper = route.children === undefined ? null : walk(route.children);
        if (deeper !== null) return deeper;
      }
      return null;
    };
    return walk(router.routes as ReactRouter.RouteObject[]);
  };

  return {
    router,
    store,
    client,
    loaders,
    storage,
    navigate,
    calls,
    bootError,
    respond(fn) {
      respond = fn;
    },
    reset() {
      navigate.length = 0;
      calls.length = 0;
      storage.writes.length = 0;
    },
    async settle() {
      let stable = 0;
      for (let i = 0; i < 200 && stable < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        stable = router.state.navigation.state === 'idle' && router.state.initialized && router.state.revalidation === 'idle' ? stable + 1 : 0;
      }
    },
    async ticks(n = 10) {
      for (let i = 0; i < n; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    },
    render() {
      return renderToString(
        createElement(
          ConfigProvider,
          { locale: esES },
          createElement(AntApp, null, createElement(RouterProvider, { router: router as never })),
        ),
      );
    },
    loginNotice() {
      const match = router.state.matches.find((m) => m.route.path === '/login');
      return match === undefined
        ? undefined
        : (router.state.loaderData[match.route.id] as { sessionExpired?: unknown } | undefined)?.sessionExpired;
    },
    findRoute,
  };
}
