import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type * as ReactRouter from 'react-router';
import type { Session } from '../../src/auth/session';

// TK-01.2 · fase 2 de QA, hallazgos H1 y H3 (decisión del usuario, 2026-11-25). Spec 05 §15.4 (DP-05), §15.6 (D-07),
// §16.2, §16.3; ESC-47, ESC-37. Matriz: docs/qa/TK-01.2-matrix.md.
// Integración sin DOM: se usa el router REAL de src/routes/router.ts (sus loaders y su setSessionLostHandler).
// Solo se sustituye createBrowserRouter (necesita window) por createMemoryRouter, y se registran las llamadas
// a router.navigate. El aviso se comprueba en el loaderData de /login y en el HTML renderizado de la app.

type Router = ReturnType<typeof ReactRouter.createMemoryRouter>;

const EXPIRED_NOTICE = /sesi[oó]n[^.<]*expir/i;
const START = '/dashboard/products';

let navigateCalls: string[] = [];
let fetchCalls: string[] = [];
let respond: () => Response = () => jsonResponse(200, { data: [] });
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

describe('QA-01.2-30 (H1; ESC-47, DP-05; decisión del usuario): expiración local con operaciones protegidas simultáneas', () => {
  it.each([2, 3])(
    '%i peticiones simultáneas con la sesión vencida → /login con el aviso visible, una sola redirección y sin notificaciones duplicadas',
    async (n) => {
      const s = session(3_600_000);
      await prepare(s, START);
      expect(router.state.location.pathname).toBe(START); // precondición: sesión vigente, pantalla protegida

      expireNow(s);
      const results = await protectedCalls(n);
      await settle();

      // La primera detecta la expiración local; las siguientes encuentran la sesión ya limpiada.
      expect(results[0]).toBe('SessionExpiredError');
      for (const r of results.slice(1)) expect(['SessionExpiredError', 'NoSessionError']).toContain(r);
      expect(fetchCalls).toEqual([]);
      expect(store.getSession()).toBeNull();
      // Termina en /login.
      expect(router.state.location.pathname).toBe('/login');
      // El aviso de sesión expirada permanece visible después de la navegación.
      expect(loginNotice()).toBe(true);
      expect(renderLogin()).toMatch(EXPIRED_NOTICE);
      // Una sola redirección efectiva y una sola notificación de pérdida de sesión.
      expect(loginArrivals.size).toBe(1);
      expect(navigateCalls).toEqual(['/login']);
      expect(storeNotifications).toBe(1);
    },
  );
});

describe('QA-01.2-31 (regresión de lo aprobado; §15.5, §15.6, D-07)', () => {
  it('(a) UNAUTHORIZED en 3 peticiones simultáneas → /login sin aviso de expiración, una redirección y una notificación', async () => {
    await prepare(session(3_600_000), START);
    respond = unauthorized;
    const results = await protectedCalls(3);
    await settle();

    expect(results).toEqual(['ApiError', 'ApiError', 'ApiError']);
    expect(fetchCalls).toHaveLength(3);
    expect(store.getSession()).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
    expect(loginNotice()).toBe(false);
    expect(renderLogin()).not.toMatch(EXPIRED_NOTICE);
    expect(navigateCalls).toEqual(['/login']);
    expect(loginArrivals.size).toBe(1);
    expect(storeNotifications).toBe(1);
  });

  it('(b) sin sesión inicial → NoSessionError, sin fetch, sin aviso y una única redirección aunque se repita', async () => {
    await prepare(null, '/login');
    expect(router.state.location.pathname).toBe('/login');

    const first = await protectedCalls(1);
    await settle();
    const second = await protectedCalls(2);
    await settle();

    expect([...first, ...second]).toEqual(['NoSessionError', 'NoSessionError', 'NoSessionError']);
    expect(fetchCalls).toEqual([]);
    expect(navigateCalls).toEqual(['/login']);
    expect(router.state.location.pathname).toBe('/login');
    expect(loginNotice()).toBe(false);
    expect(storeNotifications).toBe(0);
  });

  it('(c) una sesión nueva restablece la coordinación: una pérdida posterior vuelve a notificar y redirigir una vez', async () => {
    await prepare(session(3_600_000, 'token-1'), START);
    respond = unauthorized;
    await protectedCalls(1);
    await settle();
    expect(navigateCalls).toEqual(['/login']);

    // Nuevo login (como LoginPage): guarda la sesión y entra al dashboard.
    store.setSession(session(3_600_000, 'token-2'));
    await router.navigate(START);
    await settle();
    expect(router.state.location.pathname).toBe(START);
    navigateCalls = [];

    const results = await protectedCalls(2);
    await settle();
    expect(results).toEqual(['ApiError', 'ApiError']);
    expect(navigateCalls).toEqual(['/login']);
    expect(router.state.location.pathname).toBe('/login');
    expect(loginNotice()).toBe(false);
  });
});

describe('QA-01.2-32 (H3; §15.6, decisión del usuario: sin notificaciones ni redirecciones duplicadas)', () => {
  it('(a) tras perder la sesión por UNAUTHORIZED, una petición protegida posterior no vuelve a notificar ni redirigir', async () => {
    await prepare(session(3_600_000), START);
    respond = unauthorized;
    await protectedCalls(1);
    await settle();
    expect(navigateCalls).toEqual(['/login']);
    const arrivals = loginArrivals.size;

    const later = await protectedCalls(1);
    await settle();
    expect(later).toEqual(['NoSessionError']);
    expect(fetchCalls).toHaveLength(1);
    expect(navigateCalls).toEqual(['/login']);
    expect(loginArrivals.size).toBe(arrivals);
  });

  it('(b) tras perder la sesión por expiración local, una petición protegida posterior no redirige de nuevo y el aviso sigue visible', async () => {
    const s = session(3_600_000);
    await prepare(s, START);
    expireNow(s);
    await protectedCalls(1);
    await settle();
    expect(navigateCalls).toEqual(['/login']);
    expect(loginNotice()).toBe(true);
    const arrivals = loginArrivals.size;

    const later = await protectedCalls(1);
    await settle();
    expect(later).toEqual(['NoSessionError']);
    expect(fetchCalls).toEqual([]);
    expect(navigateCalls).toEqual(['/login']);
    expect(loginArrivals.size).toBe(arrivals);
    expect(loginNotice()).toBe(true);
    expect(renderLogin()).toMatch(EXPIRED_NOTICE);
  });
});
