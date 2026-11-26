import { describe, expect, it } from '@jest/globals';
import {
  EMPTY_CATALOG,
  LOADING,
  PRODUCTS_PATH,
  TECHNICAL_ERROR,
  bootProductsApp,
  byRoute,
  callKeys,
  deferred,
  list,
  makeSession,
} from './support/products-harness';

// TK-03.3 · ESC-41 en la CARGA COMPLETA de /dashboard/products (recarga del navegador o URL directa), con sesión
// vigente guardada y las dos lecturas pendientes. Spec 05 §16.4 "Cargando" (indicador mientras llega listProducts) y
// "Sin resultados"; §16.4 paso 1 (lecturas en paralelo). Matriz: docs/qa/TK-03.3-matrix.md (ESC-41 c).
// Archivo propio: cada arranque necesita una evaluación nueva de src/routes/router.ts. No se impone el mecanismo
// (HydrateFallback, useNavigation o carga diferida): solo que el HTML muestre un indicador de carga mientras esperan.

const products = deferred();
const alerts = deferred();
// El manejador se fija en el arranque: los loaders iniciales corren dentro de createBrowserRouter.
const app = await bootProductsApp({
  bootPath: PRODUCTS_PATH,
  stored: makeSession(3_600_000, 'token-qa'),
  responder: byRoute({ 'GET /products': () => products.promise, 'GET /products/alerts': () => alerts.promise }),
});

describe('QA-03.3-ESC-41 (c) (spec 05 §16.4): carga completa de /dashboard/products', () => {
  it('con las lecturas pendientes se ve un indicador de carga; al llegar listas vacías, el mensaje de catálogo vacío', async () => {
    await app.ticks();
    const whilePending = app.render();
    const callsWhilePending = callKeys(app.calls).sort();

    products.resolve(list([]));
    alerts.resolve(list([]));
    await app.settle();
    const done = app.render();

    expect({
      booted: app.bootError === undefined,
      callsWhilePending,
      loadingWhilePending: LOADING.test(whilePending),
      emptyWhilePending: EMPTY_CATALOG.test(whilePending),
      path: app.router.state.location.pathname,
      emptyWhenDone: EMPTY_CATALOG.test(done),
      loadingWhenDone: LOADING.test(done),
      technicalError: TECHNICAL_ERROR.test(done),
    }).toEqual({
      booted: true,
      callsWhilePending: ['GET /products', 'GET /products/alerts'],
      loadingWhilePending: true,
      emptyWhilePending: false,
      path: PRODUCTS_PATH,
      emptyWhenDone: true,
      loadingWhenDone: false,
      technicalError: false,
    });
  });
});
