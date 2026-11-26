import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ALERTS_UNAVAILABLE,
  EMPTY_CATALOG,
  LOADING,
  PRODUCTS_PATH,
  TECHNICAL_ERROR,
  apiError,
  bootProductsApp,
  byRoute,
  callKeys,
  deferred,
  highlightOf,
  internalError,
  list,
  loadInventory,
  loadProductsApi,
  makeSession,
  product,
  rowHtml,
  rowTag,
  type Product,
} from './support/products-harness';
import { jsonResponse } from './support/app-harness';

// TK-03.3 · pantalla de inventario /dashboard/products, de punta a punta en Node (sin DOM) con el router REAL y el
// loader REAL de la ruta (spec 02 F-1..F-5, §9, DP-01/02/04; spec 05 §16.1, §16.4, §16.5; ESC-41, 42, 43, 44, 52, 53,
// 54, 55 en nivel U). Matriz y contrato de interfaz: docs/qa/TK-03.3-matrix.md. Las acciones (ajustar, editar,
// desactivar) se ejecutan con las funciones reales del módulo de API y con runProductAction, pasando como recarga la
// revalidación del router (lo que la página obtiene de useRevalidator). El cableado de los botones se prueba en E2E
// (ESC-57; D6: partes E de ESC-43/54/55 en TK-03.4 y TK-04.5).

const app = await bootProductsApp({ bootPath: '/dashboard', stored: makeSession(3_600_000, 'token-qa') });
const { router, store } = app;

const A = product(1, 'Alcohol gel', 3, 3);
const B = product(2, 'Bisturí', 2, 3);
const C = product(3, 'Catéter', 9, 3);
const D = product(4, 'Dosímetro', 1, 3, false);

/** Lleva la app a /dashboard con sesión vigente y deja los registros vacíos. */
async function atDashboard(): Promise<void> {
  if (store.getSession() === null) store.setSession(makeSession(3_600_000, 'token-qa'));
  await router.navigate('/dashboard');
  await app.settle();
  app.reset();
}

async function openProducts(): Promise<string> {
  await router.navigate(PRODUCTS_PATH);
  await app.settle();
  return app.render();
}

const revalidate = () => router.revalidate();

beforeEach(async () => {
  await atDashboard();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QA-03.3-W (spec 05 §15.5, §16.1; TRACKER O3/S-2): loader de datos bajo protectedLoader', () => {
  it('W1: /dashboard/products tiene un loader propio y es hija directa de la ruta cuyo loader es protectedLoader', () => {
    expect(app.bootError).toBeUndefined();
    const found = app.findRoute(PRODUCTS_PATH);
    expect({
      found: found !== null,
      parentIsProtected: found?.parent.loader === app.loaders.protectedLoader,
      childHasLoader: typeof found?.child.loader === 'function',
    }).toEqual({ found: true, parentIsProtected: true, childHasLoader: true });
  });

  it('W2: sin sesión, abrir /dashboard/products redirige a /login sin peticiones ni navegaciones extra', async () => {
    store.clearSession('logout');
    store.consumeEndReason();
    app.reset();
    app.respond(byRoute({}));

    await router.navigate(PRODUCTS_PATH);
    await app.settle();

    expect({ path: router.state.location.pathname, calls: callKeys(app.calls), navigate: [...app.navigate] }).toEqual({
      path: '/login',
      calls: [],
      navigate: [PRODUCTS_PATH],
    });
  });
});

describe('QA-03.3-ESC-41 (spec 05 §16.4 "Cargando" y "Sin resultados"; IN-01 presentación)', () => {
  it('(a) navegación con las respuestas pendientes: las dos lecturas salen en paralelo y se ve un indicador de carga', async () => {
    const products = deferred();
    const alerts = deferred();
    app.respond(byRoute({ 'GET /products': () => products.promise, 'GET /products/alerts': () => alerts.promise }));

    void router.navigate(PRODUCTS_PATH);
    await app.ticks();
    const html = app.render();

    expect({
      callsBeforeAnyResponse: callKeys(app.calls).sort(),
      loading: LOADING.test(html),
      empty: EMPTY_CATALOG.test(html),
      technicalError: TECHNICAL_ERROR.test(html),
    }).toEqual({
      callsBeforeAnyResponse: ['GET /products', 'GET /products/alerts'],
      loading: true,
      empty: false,
      technicalError: false,
    });

    products.resolve(list([]));
    alerts.resolve(list([]));
    await app.settle();
  });

  it('(b) catálogo vacío: mensaje de catálogo vacío, sin filas, sin error ni aviso de alertas', async () => {
    app.respond(byRoute({ 'GET /products': () => list([]), 'GET /products/alerts': () => list([]) }));

    const html = await openProducts();

    expect({
      path: router.state.location.pathname,
      empty: EMPTY_CATALOG.test(html),
      rows: (html.match(/data-row-key="/g) ?? []).length,
      technicalError: TECHNICAL_ERROR.test(html),
      alertsUnavailable: ALERTS_UNAVAILABLE.test(html),
    }).toEqual({ path: PRODUCTS_PATH, empty: true, rows: 0, technicalError: false, alertsUnavailable: false });
  });
});

describe('QA-03.3-ESC-52 (RN-09, CA-01, DP-04; spec 05 §16.4 pasos 1-5): resaltado solo por cruce de id con listStockAlerts', () => {
  it('lecturas en momentos distintos: solo se resalta B; A (3/3) no, porque su id no está en alertas; C y D tampoco', async () => {
    // Entre ambas lecturas A dejó de cumplir RN-09: listStockAlerts (posterior) solo trae B, más un id ajeno al catálogo.
    app.respond(
      byRoute({
        'GET /products': () => list([A, B, C, D]),
        'GET /products/alerts': () => list([B, product(999, 'Fuera del catálogo', 0, 3)]),
      }),
    );

    const html = await openProducts();

    expect(highlightOf(html, [A.id, B.id, C.id, D.id, 999])).toEqual({
      [A.id]: false,
      [B.id]: true,
      [C.id]: false,
      [D.id]: false,
      999: 'ausente', // un id de alertas que no está en el catálogo se ignora (§16.4)
    });
  });

  it('la tabla muestra activos e inactivos con su estado (F-1); el inactivo D figura como inactivo', async () => {
    app.respond(byRoute({ 'GET /products': () => list([A, B, C, D]), 'GET /products/alerts': () => list([B]) }));

    const html = await openProducts();

    expect({
      names: [A, B, C, D].map((p) => (rowHtml(html, p.id) ?? '').includes(p.name)),
      dInactive: /inactivo/i.test(rowHtml(html, D.id) ?? ''),
      aInactive: /inactivo/i.test(rowHtml(html, A.id) ?? ''),
    }).toEqual({ names: [true, true, true, true], dInactive: true, aInactive: false });
  });
});

describe('QA-03.3-ESC-53 (DP-04, D-09; spec 05 §16.4 "Falla solo listStockAlerts")', () => {
  const P = product(20, 'Pinza', 2, 3);

  it.each([
    ['INTERNAL_ERROR', () => internalError()],
    [
      'fallo de red',
      () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('alertas con %s: tabla visible sin resaltado, aviso explícito, sin error técnico y con la sesión activa', async (_, failure) => {
    app.respond(byRoute({ 'GET /products': () => list([P]), 'GET /products/alerts': failure }));

    const html = await openProducts();

    expect({
      path: router.state.location.pathname,
      row: rowTag(html, P.id) !== null,
      highlight: highlightOf(html, [P.id]),
      alertsUnavailable: ALERTS_UNAVAILABLE.test(html),
      technicalError: TECHNICAL_ERROR.test(html),
      session: store.getSession() !== null,
      toLogin: app.navigate.includes('/login'),
    }).toEqual({
      path: PRODUCTS_PATH,
      row: true,
      highlight: { [P.id]: false }, // 2/3 no se resalta: no hay cálculo local de RN-09
      alertsUnavailable: true,
      technicalError: false,
      session: true,
      toLogin: false,
    });
  });
});

describe('QA-03.3-ESC-42 (D-09; spec 05 §16.4 "Error técnico", §16.5)', () => {
  const X = product(30, 'Xilocaína', 8, 2);
  const TECH_DETAIL = 'PrismaClientKnownRequestError: connect ECONNREFUSED 127.0.0.1:5432';

  it.each([
    ['INTERNAL_ERROR', () => internalError(TECH_DETAIL)],
    [
      'fallo de red',
      () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('listProducts con %s: mensaje genérico sin detalles técnicos, sin filas y sin cerrar la sesión', async (_, failure) => {
    app.respond(byRoute({ 'GET /products': failure, 'GET /products/alerts': () => list([]) }));

    const html = await openProducts();

    expect({
      path: router.state.location.pathname,
      technicalError: TECHNICAL_ERROR.test(html),
      leaksDetail: html.includes(TECH_DETAIL) || html.includes('INTERNAL_ERROR') || html.includes('fetch failed'),
      rows: (html.match(/data-row-key="/g) ?? []).length,
      session: store.getSession() !== null,
      toLogin: app.navigate.includes('/login'),
    }).toEqual({ path: PRODUCTS_PATH, technicalError: true, leaksDetail: false, rows: 0, session: true, toLogin: false });
  });

  it('no presenta datos antiguos como vigentes: tras una carga correcta, una recarga fallida no deja la fila anterior', async () => {
    let fail = false;
    app.respond(
      byRoute({
        'GET /products': () => (fail ? internalError(TECH_DETAIL) : list([X])),
        'GET /products/alerts': () => list([]),
      }),
    );
    const before = await openProducts();
    expect(rowTag(before, X.id)).not.toBeNull(); // precondición: la fila estaba

    fail = true;
    await router.revalidate();
    await app.settle();
    const after = app.render();

    expect({ staleRow: rowTag(after, X.id) !== null, technicalError: TECHNICAL_ERROR.test(after) }).toEqual({
      staleRow: false,
      technicalError: true,
    });
  });
});

describe('QA-03.3-ESC-54 (RN-09, IN-02, DP-04; spec 05 §16.4 "operaciones exitosas → ambas listas")', () => {
  it('ajuste 10→5 (expectedStock = stock mostrado) y después mínimo 5→4: recarga ambas listas y el resaltado sigue a listStockAlerts', async () => {
    const api = await loadProductsApi();
    const inv = await loadInventory();
    let state: Product = product(40, 'Mascarilla', 10, 5);
    let inAlerts = false;
    app.respond(
      byRoute({
        'GET /products': () => list([state]),
        'GET /products/alerts': () => list(inAlerts ? [state] : []),
        'PATCH /products/40/stock': () => {
          state = { ...state, currentStock: 5 };
          inAlerts = true;
          return jsonResponse(200, state);
        },
        'PATCH /products/40': () => {
          state = { ...state, minStockAlert: 4 };
          inAlerts = false;
          return jsonResponse(200, state);
        },
      }),
    );
    const initial = await openProducts();
    expect(highlightOf(initial, [40])).toEqual({ 40: false }); // precondición
    const shown = state;

    app.reset();
    const adjusted = await inv.runProductAction(
      () => api.adjustProductStock(shown.id, inv.buildAdjustStockRequest(shown, 5)),
      revalidate,
    );
    await app.settle();
    const afterAdjust = { result: adjusted.ok, calls: callKeys(app.calls), body: app.calls[0]?.body, html: app.render() };

    app.reset();
    const updated = await inv.runProductAction(() => api.updateProduct(40, { minStockAlert: 4 }), revalidate);
    await app.settle();
    const afterUpdate = { result: updated.ok, calls: callKeys(app.calls), body: app.calls[0]?.body, html: app.render() };

    expect({
      adjust: {
        ok: afterAdjust.result,
        first: afterAdjust.calls[0],
        reload: afterAdjust.calls.slice(1).sort(),
        body: afterAdjust.body,
        highlight: highlightOf(afterAdjust.html, [40]),
      },
      update: {
        ok: afterUpdate.result,
        first: afterUpdate.calls[0],
        reload: afterUpdate.calls.slice(1).sort(),
        body: afterUpdate.body,
        highlight: highlightOf(afterUpdate.html, [40]),
      },
    }).toEqual({
      adjust: {
        ok: true,
        first: 'PATCH /products/40/stock',
        reload: ['GET /products', 'GET /products/alerts'],
        body: { newStock: 5, expectedStock: 10 },
        highlight: { 40: true },
      },
      update: {
        ok: true,
        first: 'PATCH /products/40',
        reload: ['GET /products', 'GET /products/alerts'],
        body: { minStockAlert: 4 },
        highlight: { 40: false },
      },
    });
  });
});

describe('QA-03.3-ESC-55 (RN-09, RN-10, DP-04): desactivar un producto resaltado', () => {
  it('recarga ambas listas; sigue en la tabla como inactivo y deja de resaltarse', async () => {
    const api = await loadProductsApi();
    const inv = await loadInventory();
    let state: Product = product(50, 'Guantes', 2, 3);
    app.respond(
      byRoute({
        'GET /products': () => list([state]),
        'GET /products/alerts': () => list(state.isActive ? [state] : []),
        'POST /products/50/deactivate': () => {
          state = { ...state, isActive: false };
          return jsonResponse(200, state);
        },
      }),
    );
    const initial = await openProducts();
    expect(highlightOf(initial, [50])).toEqual({ 50: true }); // precondición

    app.reset();
    const result = await inv.runProductAction(() => api.deactivateProduct(50), revalidate);
    await app.settle();
    const html = app.render();

    expect({
      ok: result.ok,
      first: callKeys(app.calls)[0],
      reload: callKeys(app.calls).slice(1).sort(),
      highlight: highlightOf(html, [50]),
      inactive: /inactivo/i.test(rowHtml(html, 50) ?? ''),
    }).toEqual({
      ok: true,
      first: 'POST /products/50/deactivate',
      reload: ['GET /products', 'GET /products/alerts'],
      highlight: { 50: false },
      inactive: true,
    });
  });
});

describe('QA-03.3-ESC-43 (CA-13, IN-02; spec 02 F-5 y §9; spec 05 §16.4 "Conflicto" y "No encontrado")', () => {
  it('STOCK_CHANGED: informa el conflicto, recarga ambas listas, muestra el stock vigente y la sesión sigue activa', async () => {
    const api = await loadProductsApi();
    const inv = await loadInventory();
    let state: Product = product(60, 'Jeringa', 10, 5);
    app.respond(
      byRoute({
        'GET /products': () => list([state]),
        'GET /products/alerts': () => list([]),
        'PATCH /products/60/stock': () => {
          state = { ...state, currentStock: 7 }; // otro cambio llegó antes (pedido del chat)
          return apiError(409, 'STOCK_CHANGED', 'El stock cambió desde la última lectura. Vuelve a cargarlo.');
        },
      }),
    );
    await openProducts();
    const shown = state;

    app.reset();
    const result = await inv.runProductAction(
      () => api.adjustProductStock(60, inv.buildAdjustStockRequest(shown, 25)),
      revalidate,
    );
    await app.settle();
    const html = app.render();

    expect({
      result: result.ok ? 'ok' : { kind: result.error.kind, reload: 'reloadLists' in result.error && result.error.reloadLists },
      body: app.calls[0]?.body,
      reload: callKeys(app.calls).slice(1).sort(),
      shownStockIs7: /<td[^>]*>7<\/td>/.test(rowHtml(html, 60) ?? ''),
      session: store.getSession() !== null,
      toLogin: app.navigate.includes('/login'),
    }).toEqual({
      result: { kind: 'conflict', reload: true },
      body: { newStock: 25, expectedStock: 10 },
      reload: ['GET /products', 'GET /products/alerts'],
      shownStockIs7: true,
      session: true,
      toLogin: false,
    });
  });

  it('PRODUCT_NOT_FOUND: informa, recarga ambas listas y la fila desaparece; la sesión sigue activa', async () => {
    const api = await loadProductsApi();
    const inv = await loadInventory();
    let exists = true;
    const G = product(61, 'Gasa', 4, 1);
    app.respond(
      byRoute({
        'GET /products': () => list(exists ? [G] : []),
        'GET /products/alerts': () => list([]),
        'PATCH /products/61/stock': () => {
          exists = false;
          return apiError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.');
        },
      }),
    );
    await openProducts();

    app.reset();
    const result = await inv.runProductAction(() => api.adjustProductStock(61, inv.buildAdjustStockRequest(G, 0)), revalidate);
    await app.settle();
    const html = app.render();

    expect({
      kind: result.ok ? 'ok' : result.error.kind,
      reload: callKeys(app.calls).slice(1).sort(),
      row: rowTag(html, 61) !== null,
      session: store.getSession() !== null,
      toLogin: app.navigate.includes('/login'),
    }).toEqual({ kind: 'not-found', reload: ['GET /products', 'GET /products/alerts'], row: false, session: true, toLogin: false });
  });
});

describe('QA-03.3-ESC-44 (D-09; spec 05 §16.4 "Error de validación", §16.5)', () => {
  const MESSAGE = 'El precio debe ser mayor que 0.';

  it.each([
    ['createProduct', 'POST /products'],
    ['updateProduct', 'PATCH /products/70'],
    ['adjustProductStock', 'PATCH /products/70/stock'],
  ])('%s con VALIDATION_ERROR: devuelve el message para el formulario, sin recargar ni cerrar la sesión', async (op, route) => {
    const api = await loadProductsApi();
    const inv = await loadInventory();
    const V = product(70, 'Venda', 4, 1);
    app.respond(
      byRoute({
        'GET /products': () => list([V]),
        'GET /products/alerts': () => list([]),
        [route]: () => apiError(422, 'VALIDATION_ERROR', MESSAGE),
      }),
    );
    await openProducts();

    app.reset();
    const action =
      op === 'createProduct'
        ? () => api.createProduct({ name: 'Venda', price: '0.00', currentStock: 1, minStockAlert: 0 })
        : op === 'updateProduct'
          ? () => api.updateProduct(70, { price: '0.00' })
          : () => api.adjustProductStock(70, inv.buildAdjustStockRequest(V, 3));
    const result = await inv.runProductAction(action, revalidate);
    await app.settle();

    expect({
      result: result.ok ? 'ok' : result.error,
      calls: callKeys(app.calls),
      session: store.getSession() !== null,
      path: router.state.location.pathname,
      toLogin: app.navigate.includes('/login'),
    }).toEqual({
      result: { kind: 'validation', message: MESSAGE },
      calls: [route], // sin recarga
      session: true,
      path: PRODUCTS_PATH,
      toLogin: false,
    });
  });
});
