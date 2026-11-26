import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Session } from '../../src/auth/session';
import { bootApp, expireNow, makeSession, ok, unauthorized } from './support/app-harness';

// TK-01.4 · O3/S-2 y D3 (seguimientos de TK-01.2 en backlog/TRACKER.md). Spec 05 §15.4 (DP-05), §15.5, §15.6, §16.2,
// §16.3. Validación de concurrencia de loaders en una NAVEGACIÓN (la app ya inicializada): react-router 7 ejecuta en
// la misma pasada, de forma síncrona, el loader padre real (protectedLoader) y el loader hijo de prueba de
// /dashboard/products, que llama a apiRequest({ auth: true }) como harán los loaders de datos (TK-03.3, TK-04.3,
// TK-06.4). El padre no corta al hijo. Matriz: docs/qa/TK-01.4-matrix.md (N8, N9).
// navigateCalls registra toda llamada a router.navigate: la primera es la del operador (clic en el menú); cualquier
// otra solo puede venir del manejador de pérdida de sesión de src/routes/router.ts.

const app = await bootApp({ bootPath: '/login' });
const { store, router, obs } = app;

async function prepare(initial: Session | null, path: string): Promise<void> {
  app.childLoader.enabled = false;
  store.setSession(makeSession(3_600_000, 'token-preparacion'));
  if (initial === null) store.clearSession('logout');
  else store.setSession(initial);
  store.consumeEndReason();
  await router.navigate(path);
  await app.settle();
  app.childLoader.enabled = true;
  app.resetObservations();
}

async function operatorNavigates(path: string): Promise<void> {
  await router.navigate(path);
  await app.settle();
}

/** Estado observable tras una llegada a /login. */
function arrival() {
  return {
    path: router.state.location.pathname,
    loaders: [...obs.loaders],
    fetch: obs.fetch.length,
    navigateCalls: [...obs.navigate],
    loginArrivals: obs.loginArrivals.size,
    sessionExpiredInLoaderData: app.loginNotice(),
    expiredNoticeInHtml: app.noticeInHtml(),
  };
}

beforeEach(() => {
  app.respond(ok);
  app.hooks.afterNextParentLoader = null;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QA-01.4-N8 (O3/S-2, D3; §15.5, §16.3): pérdida de sesión con un loader de datos protegido en la navegación', () => {
  it('(a) causa "none" (sin sesión): el padre redirige, el hijo no genera una segunda navegación y no hay aviso; una petición posterior tampoco navega', async () => {
    await prepare(null, '/login');

    await operatorNavigates('/dashboard/products');
    const first = arrival();
    const later = await app.protectedCalls(1);
    await app.settle();

    expect({ first, later, navigateCalls: [...obs.navigate], loginArrivals: obs.loginArrivals.size }).toEqual({
      first: {
        path: '/login',
        loaders: ['parent:start', 'parent:redirect /login', 'child:start', 'child:NoSessionError'],
        fetch: 0,
        navigateCalls: ['/dashboard/products'], // solo la del operador
        loginArrivals: 1,
        sessionExpiredInLoaderData: false,
        expiredNoticeInHtml: false,
      },
      later: ['NoSessionError'],
      navigateCalls: ['/dashboard/products'],
      loginArrivals: 1,
    });
  });

  it('(b) causa "expired" detectada por el padre: el hijo no navega, el aviso se muestra y persiste tras una petición posterior', async () => {
    const s = makeSession(3_600_000, 'token-qa');
    await prepare(s, '/dashboard');
    expireNow(s);

    await operatorNavigates('/dashboard/products');
    const first = arrival();
    const later = await app.protectedCalls(1);
    await app.settle();

    expect({
      first,
      later,
      navigateCalls: [...obs.navigate],
      loginArrivals: obs.loginArrivals.size,
      noticeAfter: app.loginNotice(),
    }).toEqual({
      first: {
        path: '/login',
        loaders: ['parent:start', 'parent:redirect /login', 'child:start', 'child:NoSessionError'],
        fetch: 0,
        navigateCalls: ['/dashboard/products'],
        loginArrivals: 1,
        sessionExpiredInLoaderData: true,
        expiredNoticeInHtml: true,
      },
      later: ['NoSessionError'],
      navigateCalls: ['/dashboard/products'],
      loginArrivals: 1,
      noticeAfter: true,
    });
  });

  it('(c) causa "expired" detectada por el hijo (el padre la vio vigente): una sola redirección del manejador, con aviso', async () => {
    const s = makeSession(3_600_000, 'token-qa');
    await prepare(s, '/dashboard');
    app.hooks.afterNextParentLoader = () => expireNow(s);

    await operatorNavigates('/dashboard/products');

    expect(arrival()).toEqual({
      path: '/login',
      loaders: ['parent:start', 'parent:allow', 'child:start', 'child:SessionExpiredError'],
      fetch: 0,
      navigateCalls: ['/dashboard/products', '/login'],
      loginArrivals: 1,
      sessionExpiredInLoaderData: true,
      expiredNoticeInHtml: true,
    });
  });

  it('(d) causas sucesivas sin mezclar motivos: "expired" (con aviso) → login → cierre local + "none" (sin aviso) → login → "expired" (con aviso)', async () => {
    const s1 = makeSession(3_600_000, 'token-1');
    await prepare(s1, '/dashboard');
    expireNow(s1);
    await operatorNavigates('/dashboard/products');
    const expired1 = { notice: app.loginNotice(), html: app.noticeInHtml(), navigateCalls: [...obs.navigate] };

    // Login nuevo con el reloj ya adelantado; después, cierre local (como el layout) y el operador abre Productos.
    store.setSession(makeSession(3_600_000, 'token-2'));
    await operatorNavigates('/dashboard');
    store.clearSession('logout');
    app.resetObservations();
    await operatorNavigates('/dashboard/products');
    const none = { notice: app.loginNotice(), html: app.noticeInHtml(), navigateCalls: [...obs.navigate] };

    const s3 = makeSession(3_600_000, 'token-3');
    store.setSession(s3);
    await operatorNavigates('/dashboard');
    expireNow(s3);
    app.resetObservations();
    await operatorNavigates('/dashboard/products');
    const expired2 = { notice: app.loginNotice(), html: app.noticeInHtml(), navigateCalls: [...obs.navigate] };

    expect({ expired1, none, expired2 }).toEqual({
      expired1: { notice: true, html: true, navigateCalls: ['/dashboard/products'] },
      none: { notice: false, html: false, navigateCalls: ['/dashboard/products'] },
      expired2: { notice: true, html: true, navigateCalls: ['/dashboard/products'] },
    });
  });
});

describe('QA-01.4-N9 (O3/S-2; §15.6): recuperación tras una pérdida "none" detectada por los loaders en una navegación', () => {
  it('login nuevo → el loader hijo opera con el token nuevo; dos UNAUTHORIZED posteriores notifican y redirigen una sola vez, sin aviso', async () => {
    await prepare(null, '/login');
    await operatorNavigates('/dashboard/products');
    const loss = { path: router.state.location.pathname, navigateCalls: [...obs.navigate] };

    store.setSession(makeSession(3_600_000, 'token-nuevo'));
    app.resetObservations();
    await operatorNavigates('/dashboard/products');
    const working = { path: router.state.location.pathname, loaders: [...obs.loaders], auth: obs.fetch.map((f) => f.authorization) };

    app.resetObservations();
    app.respond(unauthorized);
    const results = await app.protectedCalls(2);
    await app.settle();

    expect({
      loss,
      working,
      results,
      navigateCalls: [...obs.navigate],
      path: router.state.location.pathname,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
    }).toEqual({
      loss: { path: '/login', navigateCalls: ['/dashboard/products'] },
      working: {
        path: '/dashboard/products',
        loaders: ['parent:start', 'parent:allow', 'child:start', 'child:ok'],
        auth: ['Bearer token-nuevo'],
      },
      results: ['ApiError', 'ApiError'],
      navigateCalls: ['/login'],
      path: '/login',
      sessionExpiredInLoaderData: false,
      expiredNoticeInHtml: false,
    });
  });
});
