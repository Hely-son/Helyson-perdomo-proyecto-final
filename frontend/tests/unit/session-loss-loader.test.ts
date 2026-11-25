import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type * as ReactRouter from 'react-router';
import type { Session } from '../../src/auth/session';

// TK-01.2 · fase 2 de QA, hallazgo H5 (decisión del usuario, 2026-11-25): la expiración la detecta un loader del
// router (protectedLoader al navegar a una ruta protegida, o loginLoader al abrir /login) y después sale una petición
// protegida. Spec 05 §15.4 (DP-05), §15.6, §16.2, §16.3; ESC-46, ESC-47, ESC-48. Matriz: docs/qa/TK-01.2-matrix.md.
// Mismo montaje que session-loss-navigation.test.ts (QA-01.2-30..32), que no se modifica: router REAL de
// src/routes/router.ts sobre createMemoryRouter; el aviso se comprueba en el loaderData de /login y en el HTML.
// navigateCalls registra toda llamada a router.navigate: la del propio test (navegación del operador, como un clic
// en el menú) se descuenta antes de las aserciones; las demás solo pueden venir del manejador de pérdida de sesión.

type Router = ReturnType<typeof ReactRouter.createMemoryRouter>;

const EXPIRED_NOTICE = /sesi[oó]n[^.<]*expir/i;
const START = '/dashboard/products';

let navigateCalls: string[] = [];
let fetchCalls: string[] = [];
let respond: () => Response | Promise<Response> = () => jsonResponse(200, { data: [] });
const realFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const unauthorized = () => jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Sesión no válida o expirada.' } });

// Se carga el react-router real antes de registrar el doble: dentro de la factoría, importar 'react-router'
// resolvería al propio doble (bloqueo). Un solo registro de módulos, así React es una sola instancia.
const actual = await import('react-router');
jest.unstable_mockModule('react-router', () => ({
  ...actual,
  createBrowserRouter: (routes: Parameters<typeof actual.createMemoryRouter>[0]) => {
    const created = actual.createMemoryRouter(routes, { initialEntries: [START] });
    const original = created.navigate.bind(created);
    created.navigate = ((to: unknown, opts?: unknown) => {
      navigateCalls.push(String(to));
      return (original as (t: unknown, o?: unknown) => Promise<void>)(to, opts);
    }) as typeof created.navigate;
    return created;
  },
}));

// App real, cargada una vez: router.ts registra su manejador de pérdida de sesión al importarse.
const { sessionStore: store } = await import('../../src/auth/session-store');
const client = await import('../../src/api/client');
const router = (await import('../../src/routes/router')).router as unknown as Router;
const { RouterProvider } = await import('react-router');
const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');

let loginArrivals = new Set<string>();
let storeNotifications = 0;
store.subscribe(() => {
  storeNotifications += 1;
});
router.subscribe((state) => {
  if (state.navigation.state === 'idle' && state.location.pathname === '/login') loginArrivals.add(state.location.key);
});

/** HTML de la app en el estado actual del router; exige que sea la pantalla de login (formulario visible). */
function renderLogin(): string {
  const html = renderToString(createElement(RouterProvider, { router: router as never }));
  expect(html).toContain('Contraseña');
  expect(html).toContain('Iniciar sesión');
  return html;
}

/**
 * Deja la app en el estado inicial del escenario. Guardar una sesión restablece la coordinación de pérdida de
 * sesión del cliente (como un login nuevo); sin sesión, se descarta con 'logout' y se consume el motivo.
 */
async function prepare(initial: Session | null, path: string): Promise<void> {
  store.setSession(session(3_600_000, 'token-preparacion'));
  if (initial === null) store.clearSession('logout');
  else store.setSession(initial);
  store.consumeEndReason();
  await router.navigate(path);
  await settle();
  navigateCalls = [];
  fetchCalls = [];
  loginArrivals = new Set();
  storeNotifications = 0;
}

/** Espera a que no haya navegación en curso durante varios ciclos seguidos (los loaders son síncronos). */
async function settle(): Promise<void> {
  let stable = 0;
  for (let i = 0; i < 200 && stable < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    stable = router.state.navigation.state === 'idle' && router.state.initialized ? stable + 1 : 0;
  }
}

function loginNotice(): unknown {
  const match = router.state.matches.find((m) => m.route.path === '/login');
  return match === undefined ? undefined : (router.state.loaderData[match.route.id] as { sessionExpired?: unknown })?.sessionExpired;
}

function protectedCalls(n: number): Promise<string[]> {
  return Promise.allSettled(Array.from({ length: n }, () => client.apiRequest('/products', { auth: true }))).then((rs) =>
    rs.map((r) => (r.status === 'fulfilled' ? 'ok' : (r.reason as Error).name)),
  );
}

function session(expiresInMs: number, token = 'token-qa'): Session {
  return { token, expiresAt: new Date(Date.now() + expiresInMs).toISOString(), operatorName: 'Operadora QA' };
}

/** Avanza el reloj de la app más allá de `expiresAt` (Date.now, que usan los guards y el cliente). */
function expireNow(s: Session): void {
  const after = Date.parse(s.expiresAt) + 60_000;
  jest.spyOn(Date, 'now').mockReturnValue(after);
}

const realConsoleError = console.error;

beforeEach(() => {
  // Solo se filtra el aviso de React al renderizar en el servidor (useLayoutEffect de useNavigate): es propio de
  // renderToString, no de la app. Cualquier otro console.error se mantiene.
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    realConsoleError(...args);
  });
  respond = () => jsonResponse(200, { data: [] });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    return respond();
  }) as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
  globalThis.fetch = realFetch;
});

/** Simula la navegación del operador (clic en el menú) y espera a que el router quede estable. */
async function operatorNavigates(path: string): Promise<void> {
  await router.navigate(path);
  await settle();
}

/** Pérdida detectada por protectedLoader: sesión vigente en START, vence el plazo y el operador abre Pedidos. */
async function lossByProtectedLoader(): Promise<void> {
  const s = session(3_600_000);
  await prepare(s, START);
  expect(router.state.location.pathname).toBe(START); // precondición: sesión vigente, pantalla protegida
  expireNow(s);
  await operatorNavigates('/dashboard/orders');
  // Precondición (comportamiento ya aprobado, ESC-46): el loader limpió la sesión y redirigió a /login con aviso.
  expect(router.state.location.pathname).toBe('/login');
  expect(store.getSession()).toBeNull();
  expect(loginNotice()).toBe(true);
  expect(loginArrivals.size).toBe(1);
  expect(storeNotifications).toBe(1);
  navigateCalls = [];
}

describe('QA-01.2-33 (H5; DP-05, §16.3): expiración detectada por protectedLoader y peticiones protegidas posteriores', () => {
  it.each([1, 2])(
    '%i petición(es) posteriores: error tipado, sin fetch, sin notificación ni navegación nuevas, y el aviso sigue visible',
    async (n) => {
      await lossByProtectedLoader();

      const later = await protectedCalls(n);
      await settle();

      // Siguen rechazándose con error tipado y sin fetch.
      for (const r of later) expect(['NoSessionError', 'SessionExpiredError']).toContain(r);
      expect(fetchCalls).toEqual([]);
      // Se comparan todas las condiciones a la vez para que el diff muestre cada una que no se cumple:
      // la pérdida ya se produjo (la detectó el loader), así que no hay notificación ni navegación nueva, y el motivo
      // original no se sobrescribe (el aviso de expiración sigue en el loaderData y en el HTML).
      expect({
        navigateCalls,
        loginArrivals: loginArrivals.size,
        storeNotifications,
        path: router.state.location.pathname,
        sessionExpiredInLoaderData: loginNotice(),
        expiredNoticeInHtml: EXPIRED_NOTICE.test(renderLogin()),
      }).toEqual({
        navigateCalls: [],
        loginArrivals: 1,
        storeNotifications: 1,
        path: '/login',
        sessionExpiredInLoaderData: true,
        expiredNoticeInHtml: true,
      });
    },
  );
});

describe('QA-01.2-34 (H5; DP-06, §16.3 "Token vencido"): expiración detectada por loginLoader y una petición protegida posterior', () => {
  it('llegada directa a /login con la sesión vencida; una petición protegida posterior no navega ni muestra el aviso', async () => {
    const s = session(3_600_000);
    await prepare(s, START);
    expireNow(s);
    await operatorNavigates('/login');
    // Precondición: loginLoader limpió la sesión vencida y muestra el formulario (ESC-48 c). El aviso en la llegada
    // directa lo fija QA-01.2-37 (a); aquí no se exige para que este caso falle solo por H5.
    expect(router.state.location.pathname).toBe('/login');
    expect(store.getSession()).toBeNull();
    const arrivals = loginArrivals.size;
    navigateCalls = [];

    const later = await protectedCalls(1);
    await settle();

    expect(later).toEqual(['NoSessionError']);
    expect(fetchCalls).toEqual([]);
    // Decisión del usuario (§16.3): llegada directa → sin aviso, y la petición posterior no lo cambia ni navega.
    expect({
      navigateCalls,
      loginArrivals: loginArrivals.size,
      storeNotifications,
      sessionExpiredInLoaderData: loginNotice(),
      expiredNoticeInHtml: EXPIRED_NOTICE.test(renderLogin()),
    }).toEqual({
      navigateCalls: [],
      loginArrivals: arrivals,
      storeNotifications: 1,
      sessionExpiredInLoaderData: false,
      expiredNoticeInHtml: false,
    });
  });
});

describe('QA-01.2-37 (§16.3, decisión del usuario): llegada directa a /login frente a llegada redirigida tras una expiración coordinada', () => {
  it('(a) llegada DIRECTA a /login con token vencido (lo detecta loginLoader) → limpia y muestra el formulario SIN aviso', async () => {
    const s = session(3_600_000);
    await prepare(s, START);
    expireNow(s);
    await operatorNavigates('/login');

    expect(router.state.location.pathname).toBe('/login');
    expect(store.getSession()).toBeNull();
    expect({
      sessionExpiredInLoaderData: loginNotice(),
      expiredNoticeInHtml: EXPIRED_NOTICE.test(renderLogin()),
      navigateCalls,
    }).toEqual({ sessionExpiredInLoaderData: false, expiredNoticeInHtml: false, navigateCalls: ['/login'] });
  });

  it('(b) llegada REDIRIGIDA por protectedLoader tras detectar la expiración → CON aviso (no basta con silenciar loginLoader)', async () => {
    const s = session(3_600_000);
    await prepare(s, START);
    expireNow(s);
    await operatorNavigates('/dashboard/orders');

    expect(router.state.location.pathname).toBe('/login');
    expect(store.getSession()).toBeNull();
    expect({
      sessionExpiredInLoaderData: loginNotice(),
      expiredNoticeInHtml: EXPIRED_NOTICE.test(renderLogin()),
      navigateCalls,
    }).toEqual({ sessionExpiredInLoaderData: true, expiredNoticeInHtml: true, navigateCalls: ['/dashboard/orders'] });
  });

  it('(c) llegada REDIRIGIDA por el cliente HTTP tras detectar la expiración → CON aviso (no basta con silenciar loginLoader)', async () => {
    const s = session(3_600_000);
    await prepare(s, START);
    expireNow(s);
    const results = await protectedCalls(1);
    await settle();

    expect(results).toEqual(['SessionExpiredError']);
    expect(fetchCalls).toEqual([]);
    expect(router.state.location.pathname).toBe('/login');
    expect({
      sessionExpiredInLoaderData: loginNotice(),
      expiredNoticeInHtml: EXPIRED_NOTICE.test(renderLogin()),
      navigateCalls,
    }).toEqual({ sessionExpiredInLoaderData: true, expiredNoticeInHtml: true, navigateCalls: ['/login'] });
  });
});

describe('QA-01.2-35 (H5; §15.6): la primera causa se conserva frente a una respuesta UNAUTHORIZED tardía', () => {
  it('una petición enviada con la sesión vigente que recibe UNAUTHORIZED después de la pérdida por el loader no notifica ni navega', async () => {
    const s = session(3_600_000);
    await prepare(s, START);
    let release: (r: Response) => void = () => undefined;
    respond = () => new Promise<Response>((resolve) => (release = resolve));
    const inFlight = client.apiRequest('/products', { auth: true }).then(
      () => 'ok',
      (e: unknown) => `${(e as Error).name}:${String((e as { code?: unknown }).code)}`,
    );
    await settle();
    expect(fetchCalls).toHaveLength(1); // salió con la sesión vigente

    expireNow(s);
    await operatorNavigates('/dashboard/orders');
    expect(router.state.location.pathname).toBe('/login');
    expect(loginNotice()).toBe(true);
    navigateCalls = [];

    release(unauthorized());
    expect(await inFlight).toBe('ApiError:UNAUTHORIZED');
    await settle();

    expect(navigateCalls).toEqual([]);
    expect(loginArrivals.size).toBe(1);
    expect(storeNotifications).toBe(1);
    expect(loginNotice()).toBe(true);
    expect(renderLogin()).toMatch(EXPIRED_NOTICE);
  });
});

describe('QA-01.2-36 (H5; §15.6): una sesión nueva tras una pérdida detectada por el loader restablece la coordinación', () => {
  it('login nuevo → una pérdida posterior por UNAUTHORIZED notifica y navega una sola vez, sin aviso de expiración', async () => {
    await lossByProtectedLoader();

    // Nuevo login (como LoginPage): guarda la sesión y entra al dashboard. Se crea con el reloj ya adelantado,
    // así que está vigente.
    store.setSession(session(3_600_000, 'token-nuevo'));
    await operatorNavigates(START);
    expect(router.state.location.pathname).toBe(START);
    navigateCalls = [];
    fetchCalls = [];

    respond = unauthorized;
    const results = await protectedCalls(2);
    await settle();

    expect(results).toEqual(['ApiError', 'ApiError']);
    expect(fetchCalls).toHaveLength(2);
    expect(navigateCalls).toEqual(['/login']);
    expect(router.state.location.pathname).toBe('/login');
    expect(loginNotice()).toBe(false);
    expect(renderLogin()).not.toMatch(EXPIRED_NOTICE);
  });
});
