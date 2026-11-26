import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Session } from '../../src/auth/session';
import { KEY, bootApp, makeSession, ok, unauthorized } from './support/app-harness';

// TK-01.4 · S-1 (seguimiento de TK-01.2 en backlog/TRACKER.md). Spec 05 §15.8 "Varias pestañas", §11.9 ESC-58;
// §15.6, §16.2, §16.3. Decisiones del usuario D1 (la pestaña receptora no navega al recibir el evento; reacciona en su
// siguiente navegación o petición protegida) y D2 (no adopta una sesión iniciada en otra pestaña).
// Matriz: docs/qa/TK-01.4-matrix.md (N1–N6).
// Esta pestaña es la RECEPTORA: la otra pestaña cambia el almacenamiento compartido y el navegador emite `storage`
// aquí. La ventana y localStorage simulados se instalan antes de importar el almacén (support/app-harness.ts), así
// que se prueba la instancia real `sessionStore` y el listener que registre al crearse.

const app = await bootApp({ bootPath: '/login' });
const { store, router, storage, win, obs } = app;
const START = '/dashboard/orders';

/** Deja esta pestaña en el estado inicial del escenario (la preparación restablece la coordinación del cliente). */
async function prepare(initial: Session | null, path: string): Promise<void> {
  app.childLoader.enabled = false;
  store.setSession(makeSession(3_600_000, 'token-preparacion'));
  if (initial === null) store.clearSession('logout');
  else store.setSession(initial);
  store.consumeEndReason();
  await router.navigate(path);
  await app.settle();
  app.resetObservations();
}

async function operatorNavigates(path: string): Promise<void> {
  await router.navigate(path);
  await app.settle();
}

beforeEach(() => {
  app.respond(ok);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QA-01.4-N1 (S-1; ESC-58, §15.8): el cierre de sesión en otra pestaña invalida la sesión en memoria', () => {
  it('(a) la instancia real sessionStore registra un único listener de "storage" en la ventana del navegador', () => {
    expect(win.storageListenerRegistrations).toBe(1);
  });

  it('(b) otra pestaña elimina la clave → memoria invalidada, una notificación, motivo "logout", sin escribir en el almacenamiento y sin navegar (D1)', async () => {
    await prepare(makeSession(3_600_000, 'token-A'), START);
    expect(storage.data.has(KEY)).toBe(true); // precondición: sesión compartida guardada

    app.otherTab.logout();
    await app.settle();

    expect({
      session: store.getSession(),
      storeNotifications: obs.storeNotifications,
      endReason: store.consumeEndReason(),
      writesByThisTab: [...storage.writes],
      stored: storage.getItem(KEY),
      navigateCalls: [...obs.navigate],
      path: router.state.location.pathname,
    }).toEqual({
      session: null,
      storeNotifications: 1,
      endReason: 'logout',
      writesByThisTab: [],
      stored: null,
      navigateCalls: [],
      path: START,
    });
  });
});

describe('QA-01.4-N2 (S-1; ESC-58): filtro de eventos de almacenamiento', () => {
  it('(a) key null (clear() en otra pestaña) → se trata como cierre: memoria invalidada, una notificación, motivo "logout", sin escrituras ni navegación', async () => {
    await prepare(makeSession(3_600_000, 'token-A'), START);

    app.otherTab.clear();
    await app.settle();

    expect({
      session: store.getSession(),
      storeNotifications: obs.storeNotifications,
      endReason: store.consumeEndReason(),
      writesByThisTab: [...storage.writes],
      navigateCalls: [...obs.navigate],
    }).toEqual({ session: null, storeNotifications: 1, endReason: 'logout', writesByThisTab: [], navigateCalls: [] });
  });

  it('(b) cambio de otra clave → se ignora: la sesión sigue en memoria y la petición protegida envía su Bearer', async () => {
    const a = makeSession(3_600_000, 'token-A');
    await prepare(a, START);

    app.otherTab.setOtherKey();
    await app.settle();
    const results = await app.protectedCalls(1);

    expect({
      session: store.getSession(),
      storeNotifications: obs.storeNotifications,
      endReason: store.consumeEndReason(),
      writesByThisTab: [...storage.writes],
      results,
      authorizations: obs.fetch.map((f) => f.authorization),
      navigateCalls: [...obs.navigate],
    }).toEqual({
      session: a,
      storeNotifications: 0,
      endReason: null,
      writesByThisTab: [],
      results: ['ok'],
      authorizations: ['Bearer token-A'],
      navigateCalls: [],
    });
  });

  it('(c) sin sesión en memoria: un login y después un cierre en otra pestaña no notifican, no se adoptan (D2) y no escriben', async () => {
    await prepare(null, '/login');
    const other = makeSession(3_600_000, 'token-otra-pestana');

    app.otherTab.login(other);
    await app.settle();
    const afterLogin = {
      session: store.getSession(),
      storeNotifications: obs.storeNotifications,
      stored: storage.getItem(KEY),
      writesByThisTab: [...storage.writes],
    };
    app.otherTab.logout();
    await app.settle();

    expect({
      afterLogin,
      afterLogout: {
        session: store.getSession(),
        storeNotifications: obs.storeNotifications,
        endReason: store.consumeEndReason(),
        writesByThisTab: [...storage.writes],
        navigateCalls: [...obs.navigate],
      },
    }).toEqual({
      afterLogin: { session: null, storeNotifications: 0, stored: JSON.stringify(other), writesByThisTab: [] },
      afterLogout: { session: null, storeNotifications: 0, endReason: null, writesByThisTab: [], navigateCalls: [] },
    });
  });
});

describe('QA-01.4-N3 (S-1; ESC-58, D2, DA-1): otra pestaña reemplaza el token', () => {
  it('descarta el token anterior con motivo "logout", no adopta el nuevo, no toca la sesión compartida nueva y la llegada a /login no muestra el aviso de expiración', async () => {
    await prepare(makeSession(3_600_000, 'token-A'), START);
    const b = makeSession(3_600_000, 'token-B-otra-pestana');

    app.otherTab.login(b);
    await app.settle();
    const afterEvent = {
      session: store.getSession(),
      storeNotifications: obs.storeNotifications,
      // DA-1 (decisión del usuario): el reemplazo es un cierre para esta pestaña; no hay valores nuevos de SessionEndReason.
      // Se consume aquí: el aviso posterior comprueba que ningún otro paso introduce 'expired'.
      endReason: store.consumeEndReason(),
      writesByThisTab: [...storage.writes],
      stored: storage.getItem(KEY),
      navigateCalls: [...obs.navigate],
      path: router.state.location.pathname,
    };

    // Siguiente petición protegida (D1): no envía ni el token anterior ni el nuevo y lleva a /login una sola vez.
    const results = await app.protectedCalls(1);
    await app.settle();

    expect({
      afterEvent,
      results,
      fetch: [...obs.fetch],
      navigateCalls: [...obs.navigate],
      path: router.state.location.pathname,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
      storedAtTheEnd: storage.getItem(KEY),
      writesByThisTabAtTheEnd: [...storage.writes],
    }).toEqual({
      afterEvent: {
        session: null,
        storeNotifications: 1,
        endReason: 'logout',
        writesByThisTab: [],
        stored: JSON.stringify(b),
        navigateCalls: [],
        path: START,
      },
      results: ['NoSessionError'],
      fetch: [],
      navigateCalls: ['/login'],
      path: '/login',
      sessionExpiredInLoaderData: false,
      expiredNoticeInHtml: false,
      storedAtTheEnd: JSON.stringify(b),
      writesByThisTabAtTheEnd: [],
    });
  });
});

describe('QA-01.4-N4 (S-1; ESC-58, D1): petición protegida después de un cierre en otra pestaña', () => {
  it('una y luego dos peticiones simultáneas: NoSessionError, sin fetch ni Bearer obsoleto, una sola navegación a /login y sin aviso', async () => {
    await prepare(makeSession(3_600_000, 'token-A'), START);

    app.otherTab.logout();
    await app.settle();
    const navigateAfterEvent = [...obs.navigate];
    const results = [...(await app.protectedCalls(1)), ...(await app.protectedCalls(2))];
    await app.settle();

    expect({
      navigateAfterEvent,
      results,
      staleBearerSent: obs.fetch.filter((f) => f.authorization === 'Bearer token-A').length,
      fetch: [...obs.fetch],
      navigateCalls: [...obs.navigate],
      loginArrivals: obs.loginArrivals.size,
      path: router.state.location.pathname,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
    }).toEqual({
      navigateAfterEvent: [],
      results: ['NoSessionError', 'NoSessionError', 'NoSessionError'],
      staleBearerSent: 0,
      fetch: [],
      navigateCalls: ['/login'],
      loginArrivals: 1,
      path: '/login',
      sessionExpiredInLoaderData: false,
      expiredNoticeInHtml: false,
    });
  });
});

describe('QA-01.4-N5 (S-1; ESC-58, D1, D3): navegación protegida después de un cierre en otra pestaña', () => {
  it('(a) el operador abre Inicio → /login sin aviso, motivo consumido; una petición posterior no genera una segunda redirección', async () => {
    await prepare(makeSession(3_600_000, 'token-A'), START);
    app.otherTab.logout();
    await app.settle();

    await operatorNavigates('/dashboard');
    const arrival = {
      path: router.state.location.pathname,
      navigateCalls: [...obs.navigate],
      loginArrivals: obs.loginArrivals.size,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
      leftoverEndReason: store.consumeEndReason(),
    };
    const later = await app.protectedCalls(1);
    await app.settle();

    expect({
      arrival,
      later,
      fetch: [...obs.fetch],
      navigateCalls: [...obs.navigate],
      loginArrivals: obs.loginArrivals.size,
    }).toEqual({
      arrival: {
        path: '/login',
        navigateCalls: ['/dashboard'], // solo la del operador
        loginArrivals: 1,
        sessionExpiredInLoaderData: false,
        expiredNoticeInHtml: false,
        leftoverEndReason: null,
      },
      later: ['NoSessionError'],
      fetch: [],
      navigateCalls: ['/dashboard'],
      loginArrivals: 1,
    });
  });

  it('(b) el operador abre Productos, cuya pantalla tiene un loader de datos protegido → /login sin aviso, sin fetch y sin segunda navegación', async () => {
    await prepare(makeSession(3_600_000, 'token-A'), START);
    app.otherTab.logout();
    await app.settle();
    app.childLoader.enabled = true;

    await operatorNavigates('/dashboard/products');

    expect({
      path: router.state.location.pathname,
      loaders: [...obs.loaders],
      fetch: [...obs.fetch],
      navigateCalls: [...obs.navigate],
      loginArrivals: obs.loginArrivals.size,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
    }).toEqual({
      path: '/login',
      loaders: ['parent:start', 'parent:redirect /login', 'child:start', 'child:NoSessionError'],
      fetch: [],
      navigateCalls: ['/dashboard/products'],
      loginArrivals: 1,
      sessionExpiredInLoaderData: false,
      expiredNoticeInHtml: false,
    });
  });
});

describe('QA-01.4-N6 (S-1; §15.6): recuperación tras un cierre en otra pestaña', () => {
  it('un login nuevo en esta pestaña opera con su token; un UNAUTHORIZED posterior notifica y redirige una sola vez, sin aviso', async () => {
    await prepare(makeSession(3_600_000, 'token-A'), START);
    app.otherTab.logout();
    await app.settle();
    const lossResults = await app.protectedCalls(1);
    await app.settle();
    const loss = { results: lossResults, path: router.state.location.pathname, navigateCalls: [...obs.navigate] };

    // Login local (como LoginPage): guarda la sesión y entra al dashboard.
    store.setSession(makeSession(3_600_000, 'token-C'));
    await operatorNavigates(START);
    app.resetObservations();
    const working = await app.protectedCalls(1);
    const workingAuth = obs.fetch.map((f) => f.authorization);

    app.respond(unauthorized);
    obs.fetch.length = 0;
    const results = await app.protectedCalls(2);
    await app.settle();

    expect({
      loss,
      working,
      workingAuth,
      results,
      fetchCount: obs.fetch.length,
      navigateCalls: [...obs.navigate],
      path: router.state.location.pathname,
      sessionExpiredInLoaderData: app.loginNotice(),
      expiredNoticeInHtml: app.noticeInHtml(),
    }).toEqual({
      loss: { results: ['NoSessionError'], path: '/login', navigateCalls: ['/login'] },
      working: ['ok'],
      workingAuth: ['Bearer token-C'],
      results: ['ApiError', 'ApiError'],
      fetchCount: 2,
      navigateCalls: ['/login'],
      path: '/login',
      sessionExpiredInLoaderData: false,
      expiredNoticeInHtml: false,
    });
  });
});
