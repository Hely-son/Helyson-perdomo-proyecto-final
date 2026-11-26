import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  LOADING,
  apiError,
  bootProductsApp,
  byRoute,
  callKeys,
  deferred,
  internalError,
  list,
  makeSession,
  product,
  rowHtml,
  rowTag,
} from './support/products-harness';
import { KEY, expireNow } from './support/app-harness';
import {
  ALERTS_ERROR,
  EMPTY_ALERTS,
  HEADING,
  HOME_PATH,
  INTERACTIVE,
  OTHER_PATH,
  PLACEHOLDER,
  REPONER,
  cells,
  hasButton,
  inOrder,
  rowOrder,
  type AlertsLoaderData,
} from './support/alerts-contract';

// TK-04.3 · panel de alertas de /dashboard (Inicio), de punta a punta en Node (sin DOM) con el router REAL y el loader
// REAL de la ruta (spec 02 F-6 y §11.3 ESC-22; spec 05 §16.1, §16.4, §16.5, §15.6; ESC-33 parte "muestra el panel",
// ESC-41 y ESC-42 en la columna /dashboard). RN-09 solo se aplica en el backend (TK-04.1): aquí se comprueba que el
// cliente muestra lo que devuelve listStockAlerts, sin recalcularlo. Matriz y contrato de interfaz:
// docs/qa/TK-04.3-matrix.md. D1 (decisión de la puerta 1): loader de ruta `alertsLoader` bajo protectedLoader.
// La carga COMPLETA de /dashboard (recarga del navegador) vive en alerts-panel-boot.test.ts: cada arranque necesita una
// evaluación nueva de src/routes/router.ts. El cableado del botón "Reintentar" y la vista real del panel con la base
// de datos se prueban en E2E (esc-22-33-alerts-panel.spec.ts).

const app = await bootProductsApp({ bootPath: OTHER_PATH, stored: makeSession(3_600_000, 'token-qa') });
const { router, store } = app;

// El orden de la API NO es alfabético a propósito: el panel no reordena. ANOMALO no cumple RN-09 (50 > 7) y está
// inactivo: si la API lo devuelve, el panel lo muestra igual, porque el cliente no calcula ninguna regla RN-.
const MASCARILLA = product(11, 'Mascarilla quirúrgica', 1, 5);
const ALCOHOL = product(12, 'Alcohol gel', 3, 4);
const ANOMALO = { ...product(13, 'Zeta fuera de regla', 50, 7), isActive: false };
const ITEMS = [MASCARILLA, ALCOHOL, ANOMALO];
const IDS = ITEMS.map((p) => p.id);

/** Datos que el router guarda para el loader de la ruta /dashboard (undefined si la ruta no tiene loader). */
function homeData(): unknown {
  const match = router.state.matches.find((m) => m.route.path === HOME_PATH);
  return match === undefined ? undefined : router.state.loaderData[match.route.id];
}

/** Deja la app en una pantalla del layout con sesión vigente y los registros vacíos. */
async function atOtherScreen(): Promise<void> {
  if (store.getSession() === null) store.setSession(makeSession(3_600_000, 'token-qa'));
  await router.navigate(OTHER_PATH);
  await app.settle();
  app.reset();
}

async function openHome(): Promise<string> {
  await router.navigate(HOME_PATH);
  await app.settle();
  return app.render();
}

beforeEach(async () => {
  await atOtherScreen();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QA-04.3-W (D1; spec 05 §15.5, §16.1; TRACKER TK-01.2 O3/S-2): loader de datos bajo protectedLoader', () => {
  it('W1: /dashboard tiene un loader propio y es hija directa de la ruta cuyo loader es protectedLoader', () => {
    expect(app.bootError).toBeUndefined();
    const found = app.findRoute(HOME_PATH);
    const exported = (app.loaders as unknown as Record<string, unknown>)['alertsLoader'];
    expect({
      found: found !== null,
      parentIsProtected: found?.parent.loader === app.loaders.protectedLoader,
      childHasLoader: typeof found?.child.loader === 'function',
      isAlertsLoader: typeof exported === 'function' && found?.child.loader === exported,
    }).toEqual({ found: true, parentIsProtected: true, childHasLoader: true, isAlertsLoader: true });
  });

  it('W2 (guarda, ya verde antes de implementar): sin sesión, abrir /dashboard redirige a /login sin peticiones ni navegaciones extra', async () => {
    store.clearSession('logout');
    store.consumeEndReason();
    app.reset();
    app.respond(byRoute({}));

    await router.navigate(HOME_PATH);
    await app.settle();

    expect({ path: router.state.location.pathname, calls: callKeys(app.calls), navigate: [...app.navigate] }).toEqual({
      path: '/login',
      calls: [],
      navigate: [HOME_PATH],
    });
  });

  it('W3 (guarda, ya verde antes de implementar): con la sesión vencida, abrir /dashboard no envía GET /products/alerts y redirige a /login con aviso, una sola vez', async () => {
    const session = makeSession(3_600_000, 'token-vencida');
    store.setSession(session);
    app.reset();
    app.respond(byRoute({}));
    expireNow(session);

    await router.navigate(HOME_PATH);
    await app.settle();

    expect({
      path: router.state.location.pathname,
      calls: callKeys(app.calls),
      navigate: [...app.navigate],
      memory: store.getSession(),
      notice: app.loginNotice(),
    }).toEqual({ path: '/login', calls: [], navigate: [HOME_PATH], memory: null, notice: true });
  });
});

describe('QA-04.3-ESC-33 (AU-01, F-6 pasos 1-2, IN-03; spec 05 §16.4 "Datos disponibles"): el panel muestra lo que devuelve listStockAlerts', () => {
  it('D1: una sola lectura GET /products/alerts con Bearer; el loader entrega status ready con las alertas tal cual, en el orden de la API', async () => {
    app.respond(byRoute({ 'GET /products/alerts': () => list(ITEMS) }));

    await openHome();

    expect({
      path: router.state.location.pathname,
      calls: callKeys(app.calls),
      authorization: app.calls.map((c) => c.authorization),
      data: homeData() as AlertsLoaderData | undefined,
    }).toEqual({
      path: HOME_PATH,
      calls: ['GET /products/alerts'], // Inicio no lee el catálogo ni calcula nada con él
      authorization: ['Bearer token-qa'],
      data: { status: 'ready', alerts: ITEMS },
    });
  });

  it('D2: encabezado conservado y una fila por producto con nombre, stock actual y mínimo, en el orden de la API (sin reordenar)', async () => {
    app.respond(byRoute({ 'GET /products/alerts': () => list(ITEMS) }));

    const html = await openHome();

    expect({
      heading: HEADING.test(html),
      placeholder: PLACEHOLDER.test(html),
      order: rowOrder(html, IDS), // API: Mascarilla, Alcohol, Zeta (no alfabético)
      cells: ITEMS.map((p) => inOrder(cells(rowHtml(html, p.id)), [p.name, String(p.currentStock), String(p.minStockAlert)])),
      rows: (html.match(/data-row-key="/g) ?? []).length,
    }).toEqual({
      heading: true,
      placeholder: false,
      order: [11, 12, 13],
      cells: [true, true, true],
      rows: 3,
    });
  });

  it('D3 (RN-09 solo en backend): un ítem que la API devuelve aunque no cumpla stock <= mínimo ni esté activo se muestra igual; no se filtra ni se recalcula', async () => {
    app.respond(byRoute({ 'GET /products/alerts': () => list([ANOMALO]) }));

    const html = await openHome();

    expect({
      shown: rowTag(html, ANOMALO.id) !== null,
      cells: inOrder(cells(rowHtml(html, ANOMALO.id)), [ANOMALO.name, '50', '7']),
      empty: EMPTY_ALERTS.test(html),
    }).toEqual({ shown: true, cells: true, empty: false });
  });
});

describe('QA-04.3-ESC-22 (IN-03, F-6 paso 3; V2 excluido): el panel es solo de consulta', () => {
  it('sin "Reponer", sin órdenes de reposición y sin ningún botón, enlace o acción dentro de las filas', async () => {
    app.respond(byRoute({ 'GET /products/alerts': () => list(ITEMS) }));

    const html = await openHome();

    expect({
      rows: (html.match(/data-row-key="/g) ?? []).length,
      reponer: REPONER.test(html),
      reposicion: /reposici[oó]n/i.test(html),
      interactiveInRows: IDS.map((id) => INTERACTIVE.test(rowHtml(html, id) ?? '')),
    }).toEqual({ rows: 3, reponer: false, reposicion: false, interactiveInRows: [false, false, false] });
  });

  it('con la lista vacía y con error tampoco hay "Reponer"', async () => {
    app.respond(byRoute({ 'GET /products/alerts': () => list([]) }));
    const empty = await openHome();
    app.respond(byRoute({ 'GET /products/alerts': () => internalError() }));
    await router.revalidate();
    await app.settle();
    const failed = app.render();

    expect({ emptyReponer: REPONER.test(empty), failedReponer: REPONER.test(failed), failedState: ALERTS_ERROR.test(failed) }).toEqual({
      emptyReponer: false,
      failedReponer: false,
      failedState: true, // precondición: de verdad se renderizó el estado de error
    });
  });
});

describe('QA-04.3-ESC-41 (spec 05 §16.4 columna /dashboard "Cargando" y "Sin resultados"; IN-03 presentación)', () => {
  it('(a) abrir Inicio con la respuesta pendiente: una lectura de alertas y un indicador de carga, sin vacío, sin error y sin filas', async () => {
    const alerts = deferred();
    app.respond(byRoute({ 'GET /products/alerts': () => alerts.promise }));

    void router.navigate(HOME_PATH);
    await app.ticks();
    const html = app.render();

    expect({
      callsBeforeResponse: callKeys(app.calls),
      loading: LOADING.test(html),
      empty: EMPTY_ALERTS.test(html),
      error: ALERTS_ERROR.test(html),
      rows: (html.match(/data-row-key="/g) ?? []).length,
    }).toEqual({ callsBeforeResponse: ['GET /products/alerts'], loading: true, empty: false, error: false, rows: 0 });

    alerts.resolve(list([]));
    await app.settle();
  });

  it('(b) lista vacía: mensaje de que no hay productos en alerta, sin filas, sin error, sin indicador y con el encabezado', async () => {
    app.respond(byRoute({ 'GET /products/alerts': () => list([]) }));

    const html = await openHome();

    expect({
      path: router.state.location.pathname,
      data: homeData() as AlertsLoaderData | undefined,
      empty: EMPTY_ALERTS.test(html),
      heading: HEADING.test(html),
      placeholder: PLACEHOLDER.test(html),
      rows: (html.match(/data-row-key="/g) ?? []).length,
      error: ALERTS_ERROR.test(html),
      loading: LOADING.test(html),
    }).toEqual({
      path: HOME_PATH,
      data: { status: 'ready', alerts: [] },
      empty: true,
      heading: true,
      placeholder: false,
      rows: 0,
      error: false,
      loading: false,
    });
  });

  it('con datos no se muestra el mensaje de vacío', async () => {
    app.respond(byRoute({ 'GET /products/alerts': () => list([ALCOHOL]) }));

    const html = await openHome();

    expect({ empty: EMPTY_ALERTS.test(html), row: rowTag(html, ALCOHOL.id) !== null }).toEqual({ empty: false, row: true });
  });
});

describe('QA-04.3-ESC-42 (D-09; spec 05 §16.4 "Error técnico", §16.5): INTERNAL_ERROR o fallo de red al cargar el panel', () => {
  const TECH_DETAIL = 'PrismaClientKnownRequestError: connect ECONNREFUSED 127.0.0.1:5432';

  it.each([
    ['INTERNAL_ERROR', () => internalError(TECH_DETAIL)],
    [
      'fallo de red',
      () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('%s: mensaje genérico sin detalles técnicos, con "Reintentar", sin filas, sin confundirlo con "sin alertas" y sin cerrar la sesión', async (_, failure) => {
    app.respond(byRoute({ 'GET /products/alerts': failure }));

    const html = await openHome();

    expect({
      path: router.state.location.pathname,
      data: homeData() as AlertsLoaderData | undefined,
      error: ALERTS_ERROR.test(html),
      retry: hasButton(html, /reintentar/i),
      leaksDetail: [TECH_DETAIL, 'INTERNAL_ERROR', 'fetch failed', 'ECONNREFUSED', 'TypeError'].some((d) => html.includes(d)),
      empty: EMPTY_ALERTS.test(html), // no tener datos no es "no hay alertas" (§16.4)
      heading: HEADING.test(html),
      rows: (html.match(/data-row-key="/g) ?? []).length,
      session: store.getSession() !== null,
      toLogin: app.navigate.includes('/login'),
    }).toEqual({
      path: HOME_PATH,
      data: { status: 'error' },
      error: true,
      retry: true,
      leaksDetail: false,
      empty: false,
      heading: true,
      rows: 0,
      session: true,
      toLogin: false,
    });
  });

  it('no presenta datos antiguos como vigentes: tras una carga correcta, una recarga fallida no deja la fila anterior; al volver a responder bien (lo que hace "Reintentar") se recupera', async () => {
    let mode: 'ok' | 'fail' = 'ok';
    app.respond(
      byRoute({
        'GET /products/alerts': () => (mode === 'ok' ? list([MASCARILLA]) : internalError(TECH_DETAIL)),
      }),
    );
    const before = await openHome();
    expect(rowTag(before, MASCARILLA.id)).not.toBeNull(); // precondición: la fila estaba

    mode = 'fail';
    await router.revalidate();
    await app.settle();
    const failed = app.render();

    app.respond(byRoute({ 'GET /products/alerts': () => list([ALCOHOL]) })); // la API vuelve a responder bien
    await router.revalidate();
    await app.settle();
    const recovered = app.render();

    expect({
      failed: { staleRow: rowTag(failed, MASCARILLA.id) !== null, error: ALERTS_ERROR.test(failed), empty: EMPTY_ALERTS.test(failed) },
      recovered: {
        row: rowTag(recovered, ALCOHOL.id) !== null,
        staleRow: rowTag(recovered, MASCARILLA.id) !== null,
        error: ALERTS_ERROR.test(recovered),
      },
    }).toEqual({
      failed: { staleRow: false, error: true, empty: false },
      recovered: { row: true, staleRow: false, error: false },
    });
  });
});

describe('QA-04.3-ESC-42 / spec 05 §15.6 (CA-11): UNAUTHORIZED al cargar el panel', () => {
  it('descarta el token (memoria y almacenamiento) y redirige una sola vez a /login, sin aviso de expiración ni mensaje de error del panel', async () => {
    app.respond(byRoute({ 'GET /products/alerts': () => apiError(401, 'UNAUTHORIZED', 'Sesión no válida o expirada.') }));

    await router.navigate(HOME_PATH);
    await app.settle();

    expect({
      path: router.state.location.pathname,
      calls: callKeys(app.calls),
      memory: store.getSession(),
      stored: app.storage.getItem(KEY),
      loginRedirects: app.navigate.filter((to) => to === '/login').length,
      expiredNotice: app.loginNotice(),
      panelErrorShown: ALERTS_ERROR.test(app.render()),
    }).toEqual({
      path: '/login',
      calls: ['GET /products/alerts'],
      memory: null,
      stored: null,
      loginRedirects: 1,
      expiredNotice: false,
      panelErrorShown: false,
    });
  });
});
