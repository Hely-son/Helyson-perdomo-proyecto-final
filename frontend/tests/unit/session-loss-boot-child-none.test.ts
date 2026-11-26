import { describe, expect, it } from '@jest/globals';
import { bootApp, makeSession, unauthorized } from './support/app-harness';

// TK-01.4 · O3/S-2 y D3 (seguimientos de TK-01.2 en backlog/TRACKER.md). Spec 05 §15.5 (sin sesión), §15.6, §16.2,
// §16.3. Matriz: docs/qa/TK-01.4-matrix.md (N7 a, N8 "none" en el arranque, N9).
// Carga completa de /dashboard/products SIN sesión guardada, con el loader hijo de prueba que llama a
// apiRequest({ auth: true }). react-router 7 ejecuta el loader padre real (protectedLoader) y el hijo de forma síncrona
// DENTRO de createBrowserRouter: hoy el hijo llega a notifySessionLost('none') y el manejador de src/routes/router.ts
// referencia `router` antes de su inicialización (zona muerta temporal).
// Un archivo por arranque: cada uno necesita una evaluación nueva de router.ts.

const app = await bootApp({ bootPath: '/dashboard/products' });
const { store, router, obs } = app;

describe('QA-01.4-N7 (a) (O3/S-2; §15.5, §16.3): pérdida "none" detectada durante createBrowserRouter', () => {
  it('los loaders padre e hijo corren dentro de la creación; sin ReferenceError, termina en /login sin aviso, sin fetch ni redirecciones duplicadas; las peticiones posteriores no navegan', async () => {
    await app.settle();
    const afterBoot = {
      bootError: app.bootError === undefined ? null : String(app.bootError),
      loadersAtCreation: app.loadersAtCreation,
      loaders: [...obs.loaders],
      fetch: obs.fetch.length,
      path: router.state.location.pathname,
      navigateCalls: [...obs.navigate],
      loginArrivals: obs.loginArrivals.size,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
      leftoverEndReason: store.consumeEndReason(),
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
    }).toEqual({
      afterBoot: {
        bootError: null,
        // Síncronos y en paralelo: ambos se ejecutan antes de que createBrowserRouter devuelva.
        loadersAtCreation: ['parent:start', 'parent:redirect /login', 'child:start'],
        loaders: ['parent:start', 'parent:redirect /login', 'child:start', 'child:NoSessionError'],
        fetch: 0,
        path: '/login',
        navigateCalls: [],
        loginArrivals: 1,
        sessionExpiredInLoaderData: false,
        expiredNoticeInHtml: false,
        leftoverEndReason: null,
      },
      later: ['NoSessionError', 'NoSessionError', 'NoSessionError'],
      fetch: 0,
      navigateCalls: [],
      sameLocation: true,
      sessionExpiredInLoaderData: false,
    });
  });
});

describe('QA-01.4-N9 (O3/S-2; §15.6): recuperación tras la pérdida detectada en el arranque', () => {
  it('login nuevo → el loader hijo opera con el token nuevo; dos UNAUTHORIZED posteriores notifican y redirigen una sola vez, sin aviso', async () => {
    await app.settle();
    store.setSession(makeSession(3_600_000, 'token-nuevo')); // como LoginPage
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
