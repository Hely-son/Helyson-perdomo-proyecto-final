import { describe, expect, it } from '@jest/globals';
import { LOADING, bootProductsApp, byRoute, callKeys, deferred, list, makeSession, product, rowTag } from './support/products-harness';
import { EMPTY_ALERTS, HEADING, HOME_PATH, PLACEHOLDER, ALERTS_ERROR } from './support/alerts-contract';

// TK-04.3 · ESC-41 en la CARGA COMPLETA de /dashboard (recarga del navegador o URL directa), con sesión vigente
// guardada y listStockAlerts pendiente. Spec 05 §16.4 columna /dashboard "Cargando" (indicador mientras llega
// listStockAlerts) y "Sin resultados"; spec 02 F-6. Matriz: docs/qa/TK-04.3-matrix.md (ESC-41 c).
// Archivo propio: cada arranque necesita una evaluación nueva de src/routes/router.ts. No se impone el mecanismo
// (HydrateFallback del layout, useNavigation o carga diferida): solo que el HTML muestre un indicador mientras espera.

const alerts = deferred();
const P = product(21, 'Pinza hemostática', 2, 3);
// El manejador se fija en el arranque: los loaders iniciales corren dentro de createBrowserRouter.
const app = await bootProductsApp({
  bootPath: HOME_PATH,
  stored: makeSession(3_600_000, 'token-qa'),
  responder: byRoute({ 'GET /products/alerts': () => alerts.promise }),
});

describe('QA-04.3-ESC-41 (c) (spec 05 §16.4): carga completa de /dashboard', () => {
  it('con la lectura pendiente se ve un indicador de carga y ningún estado final; al llegar la respuesta, el panel con su fila', async () => {
    await app.ticks();
    const whilePending = app.render();
    const callsWhilePending = callKeys(app.calls);

    alerts.resolve(list([P]));
    await app.settle();
    const done = app.render();

    expect({
      booted: app.bootError === undefined,
      callsWhilePending,
      loadingWhilePending: LOADING.test(whilePending),
      emptyWhilePending: EMPTY_ALERTS.test(whilePending),
      errorWhilePending: ALERTS_ERROR.test(whilePending),
      placeholderWhilePending: PLACEHOLDER.test(whilePending),
      path: app.router.state.location.pathname,
      headingWhenDone: HEADING.test(done),
      rowWhenDone: rowTag(done, P.id) !== null,
      loadingWhenDone: LOADING.test(done),
    }).toEqual({
      booted: true,
      callsWhilePending: ['GET /products/alerts'],
      loadingWhilePending: true,
      emptyWhilePending: false,
      errorWhilePending: false,
      placeholderWhilePending: false,
      path: HOME_PATH,
      headingWhenDone: true,
      rowWhenDone: true,
      loadingWhenDone: false,
    });
  });
});
