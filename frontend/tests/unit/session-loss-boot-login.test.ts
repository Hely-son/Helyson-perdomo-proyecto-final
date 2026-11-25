import { afterAll, describe, expect, it, jest } from '@jest/globals';
import type * as ReactRouter from 'react-router';

// TK-01.2 · fase 2 de QA, hallazgo H6 (decisión del usuario, 2026-11-25): carga completa de la app con un token vencido
// guardado. Spec 05 §15.4 (DP-05), §15.6, §16.2, §16.3 (decisión del usuario sobre la llegada directa); ESC-46, ESC-48.
// Matriz: docs/qa/TK-01.2-matrix.md.
// Arranque real: la sesión vencida se guarda en el almacenamiento ANTES de importar el almacén y el router, así que el
// almacén se hidrata como en el navegador y el loader inicial corre dentro de la creación del router, en el orden real
// de src/routes/router.ts (crear el router y después registrar el manejador). Solo se sustituye la implementación de
// createBrowserRouter (necesita window) por createMemoryRouter con la URL de arranque; react-router 7 ejecuta el loader
// inicial de forma síncrona en ambos. Un archivo por URL de arranque: cada uno necesita una evaluación nueva de
// router.ts y el registro ESM de Jest no se puede reiniciar sin duplicar React.
// Variante: (b) D1, arranque en /login.

type Router = ReturnType<typeof ReactRouter.createMemoryRouter>;

const BOOT_PATH = '/login';
const EXPECT_NOTICE = false;
const KEY = 'medsupply.session';
const EXPIRED_NOTICE = /sesi[oó]n[^.<]*expir/i;

const navigateCalls: string[] = [];
const fetchCalls: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  fetchCalls.push(String(input));
  return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

// Almacenamiento del navegador con una sesión vencida guardada (como tras cerrar el navegador con la sesión abierta).
const storage = new Map<string, string>([
  [KEY, JSON.stringify({ token: 'token-vencido-qa', expiresAt: new Date(Date.now() - 60_000).toISOString(), operatorName: 'Operadora QA' })],
]);
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  },
});

// Solo se filtra el aviso de React al renderizar en el servidor (useLayoutEffect de useNavigate).
const realConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
  realConsoleError(...args);
};

// react-router real cargado antes de registrar el doble (importarlo dentro de la factoría resolvería al propio doble).
const actual = await import('react-router');
jest.unstable_mockModule('react-router', () => ({
  ...actual,
  createBrowserRouter: (routes: Parameters<typeof actual.createMemoryRouter>[0]) => {
    const created = actual.createMemoryRouter(routes, { initialEntries: [BOOT_PATH] });
    const original = created.navigate.bind(created);
    created.navigate = ((to: unknown, opts?: unknown) => {
      navigateCalls.push(String(to));
      return (original as (t: unknown, o?: unknown) => Promise<void>)(to, opts);
    }) as typeof created.navigate;
    return created;
  },
}));

// Arranque de la app: el almacén se hidrata con la sesión vencida; router.ts crea el router (loader inicial) y registra
// su manejador de pérdida de sesión, en ese orden.
const { sessionStore: store } = await import('../../src/auth/session-store');
const hydratedToken = store.getSession()?.token ?? null;
const client = await import('../../src/api/client');
const router = (await import('../../src/routes/router')).router as unknown as Router;
const { RouterProvider } = await import('react-router');
const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');

afterAll(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
});

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

function renderLogin(): string {
  const html = renderToString(createElement(RouterProvider, { router: router as never }));
  expect(html).toContain('Contraseña');
  expect(html).toContain('Iniciar sesión');
  return html;
}

function protectedCalls(n: number): Promise<string[]> {
  return Promise.allSettled(Array.from({ length: n }, () => client.apiRequest('/products', { auth: true }))).then((rs) =>
    rs.map((r) => (r.status === 'fulfilled' ? 'ok' : (r.reason as Error).name)),
  );
}

function observed() {
  return {
    path: router.state.location.pathname,
    locationKey: router.state.location.key,
    navigateCalls: [...navigateCalls],
    sessionExpiredInLoaderData: loginNotice(),
    expiredNoticeInHtml: EXPIRED_NOTICE.test(renderLogin()),
  };
}

describe('QA-01.2-38 (b) (H6; ESC-48 c, §16.3 "Token vencido", decisión del usuario): carga completa de /login con token vencido', () => {
  it('arranque en /login → formulario sin aviso; las peticiones protegidas posteriores fallan con error tipado, sin fetch ni navegación nueva, y el aviso sigue ausente', async () => {
    await settle();

    // Precondiciones del arranque (no dependen de H6): el almacén se hidrató con la sesión vencida, el loader inicial la
    // limpió (memoria y almacenamiento), se llegó a /login con el aviso que corresponde y no hubo llamadas a la API ni
    // navegaciones del manejador de pérdida de sesión.
    expect(hydratedToken).toBe('token-vencido-qa');
    expect(store.getSession()).toBeNull();
    expect(storage.has(KEY)).toBe(false);
    expect(fetchCalls).toEqual([]);
    const afterBoot = observed();
    expect(afterBoot).toEqual({
      path: '/login',
      locationKey: afterBoot.locationKey,
      navigateCalls: [],
      sessionExpiredInLoaderData: EXPECT_NOTICE,
      expiredNoticeInHtml: EXPECT_NOTICE,
    });

    // Peticiones protegidas posteriores (una y luego dos simultáneas): error tipado, sin fetch y sin navegación nueva;
    // el aviso queda como tras el arranque. Se comparan todas las condiciones a la vez para ver cada una que falle.
    const later = [...(await protectedCalls(1)), ...(await protectedCalls(2))];
    await settle();
    expect(later).toEqual(['NoSessionError', 'NoSessionError', 'NoSessionError']);
    expect(fetchCalls).toEqual([]);
    expect(observed()).toEqual({
      path: '/login',
      locationKey: afterBoot.locationKey,
      navigateCalls: [],
      sessionExpiredInLoaderData: EXPECT_NOTICE,
      expiredNoticeInHtml: EXPECT_NOTICE,
    });
  });
});
