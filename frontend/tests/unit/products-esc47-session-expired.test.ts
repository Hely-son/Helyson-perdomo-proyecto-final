import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  PRODUCTS_PATH,
  bootProductsApp,
  byRoute,
  callKeys,
  highlightOf,
  list,
  loadInventory,
  loadProductsApi,
  makeSession,
  product,
} from './support/products-harness';
import { EXPIRED_NOTICE, KEY, expireNow } from './support/app-harness';

// TK-03.3 · ESC-47 (spec 05 §11.5, §15.4 DP-05; seguimiento "TK-01.2 (D4, ESC-47)" de backlog/TRACKER.md) con la
// acción REAL de ajustar stock del módulo de API que usa la pantalla (decisión D2 de la puerta 1), dentro de la app real:
// el expiresAt pasa con /dashboard/products abierta; la petición no se envía, se limpia la sesión y se redirige a /login
// con el aviso de expiración. La acción no muestra un error genérico (classifyProductError → 'session').
// Matriz: docs/qa/TK-03.3-matrix.md. Archivo propio: termina en /login con la sesión limpia.

const session = makeSession(3_600_000, 'token-esc47');
const P = product(80, 'Termómetro', 6, 2);
const app = await bootProductsApp({
  bootPath: '/dashboard',
  stored: session,
  responder: byRoute({ 'GET /products': () => list([P]), 'GET /products/alerts': () => list([]) }),
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QA-03.3-ESC-47 (AU-03, DP-05): la sesión vence con /dashboard/products abierta', () => {
  it('ajustar stock no envía la petición, limpia la sesión y redirige a /login con el aviso de expiración', async () => {
    const api = await loadProductsApi();
    const inv = await loadInventory();
    await app.router.navigate(PRODUCTS_PATH);
    await app.settle();
    expect({ path: app.router.state.location.pathname, row: highlightOf(app.render(), [P.id]) }).toEqual({
      path: PRODUCTS_PATH,
      row: { [P.id]: false }, // precondición: la pantalla real está abierta con el producto
    });
    app.reset();

    expireNow(session);
    const error = await api.adjustProductStock(P.id, inv.buildAdjustStockRequest(P, 3)).then(
      () => null,
      (e: unknown) => e,
    );
    const outcome = inv.classifyProductError(error);
    await app.settle();

    expect({
      error: error instanceof Error ? error.name : error,
      outcome,
      calls: callKeys(app.calls),
      memory: app.store.getSession(),
      stored: app.storage.getItem(KEY),
      navigate: [...app.navigate],
      path: app.router.state.location.pathname,
      noticeInLoaderData: app.loginNotice(),
      noticeInHtml: EXPIRED_NOTICE.test(app.render()),
    }).toEqual({
      error: 'SessionExpiredError',
      outcome: { kind: 'session' },
      calls: [], // ni PATCH /products/80/stock ni ninguna otra
      memory: null,
      stored: null,
      navigate: ['/login'], // una sola, desde el manejador de pérdida de sesión
      path: '/login',
      noticeInLoaderData: true,
      noticeInHtml: true,
    });
  });
});
