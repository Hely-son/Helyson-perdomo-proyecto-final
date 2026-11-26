import { describe, expect, it, jest } from '@jest/globals';
import { bootApp, makeSession, unauthorized } from './support/app-harness';

// TK-01.4 · O3/S-2 (seguimiento de TK-01.2 en backlog/TRACKER.md). Spec 05 §15.4 (DP-05), §15.6, §16.2, §16.3.
// Matriz: docs/qa/TK-01.4-matrix.md (N7 b, N8 "expired" en el arranque, N9).
// Carga completa de /dashboard/products con una sesión guardada que vence ENTRE el loader padre y el hijo: el padre
// (protectedLoader) la ve vigente y deja pasar; el hijo de prueba llama a apiRequest({ auth: true }), que detecta la
// expiración local e invoca el manejador de pérdida de sesión DENTRO de createBrowserRouter. Es el camino del manejador
// que no depende de D3: hoy referencia `router` en zona muerta temporal (ReferenceError) y deja `lossNotified` en true.
// El reloj se adelanta con un gancho justo después del primer loader padre (determinista, sin depender de tiempos).
// Un archivo por arranque: cada uno necesita una evaluación nueva de router.ts.

const stored = makeSession(3_600_000, 'token-que-vence');
const app = await bootApp({
  bootPath: '/dashboard/products',
  stored,
  afterFirstParentLoader: () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(stored.expiresAt) + 60_000);
  },
});
const { store, router, obs, storage } = app;

describe('QA-01.4-N7 (b) (O3/S-2; DP-05, §16.3): el manejador de pérdida de sesión se invoca durante createBrowserRouter', () => {
  it('sin ReferenceError: termina en /login con el aviso de expiración, una sola redirección y sin fetch; las peticiones posteriores no navegan y el aviso persiste', async () => {
    await app.settle();
    const afterBoot = {
      bootError: app.bootError === undefined ? null : String(app.bootError),
      loadersAtCreation: app.loadersAtCreation,
      loaders: [...obs.loaders],
      fetch: obs.fetch.length,
      session: store.getSession(),
      stored: storage.getItem('medsupply.session'),
      path: router.state.location.pathname,
      navigateCalls: [...obs.navigate],
      loginArrivals: obs.loginArrivals.size,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
    };
    const key = router.state.location.key;

    const later = [...(await app.protectedCalls(1)), ...(await app.protectedCalls(2))];
    await app.settle();

    expect({
      afterBoot,
      later,
      fetch: obs.fetch.length,
      navigateCalls: [...obs.navigate],
      sameLocation: router.state.location.key === key,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
    }).toEqual({
      afterBoot: {
        bootError: null,
        loadersAtCreation: ['parent:start', 'parent:allow', 'child:start'],
        loaders: ['parent:start', 'parent:allow', 'child:start', 'child:SessionExpiredError'],
        fetch: 0,
        session: null,
        stored: null,
        path: '/login',
        navigateCalls: ['/login'],
        loginArrivals: 1,
        sessionExpiredInLoaderData: true,
        expiredNoticeInHtml: true,
      },
      later: ['NoSessionError', 'NoSessionError', 'NoSessionError'],
      fetch: 0,
      navigateCalls: ['/login'],
      sameLocation: true,
      sessionExpiredInLoaderData: true,
      expiredNoticeInHtml: true,
    });
  });
});

describe('QA-01.4-N9 (O3/S-2; §15.6): recuperación tras la pérdida detectada en el arranque', () => {
  it('login nuevo → opera con el token nuevo; dos UNAUTHORIZED posteriores notifican y redirigen una sola vez, sin aviso', async () => {
    await app.settle();
    store.setSession(makeSession(3_600_000, 'token-nuevo')); // como LoginPage; el reloj sigue adelantado
    app.resetObservations();
    await router.navigate('/dashboard/products');
    await app.settle();
    const working = { path: router.state.location.pathname, loaders: [...obs.loaders], auth: obs.fetch.map((f) => f.authorization) };

    app.resetObservations();
    app.respond(unauthorized);
    const results = await app.protectedCalls(2);
    await app.settle();

    expect({
      working,
      results,
      navigateCalls: [...obs.navigate],
      path: router.state.location.pathname,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
    }).toEqual({
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
