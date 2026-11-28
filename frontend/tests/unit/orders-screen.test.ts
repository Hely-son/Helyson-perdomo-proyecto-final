import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { jsonResponse } from './support/app-harness';
import {
  LOADING,
  apiError,
  bootProductsApp,
  byRoute,
  callKeys,
  deferred,
  internalError,
  makeSession,
  rowHtml,
  type Responder,
} from './support/products-harness';
import {
  ACTIONS_BY_STATUS,
  ALL_STATUSES,
  DETAIL_ERROR,
  EMPTY_ORDERS,
  LIST_ERROR,
  ORDERS_PATH,
  ORDER_GONE,
  STATUS_FILTER,
  actionsIn,
  detail,
  listParams,
  loadOrderDetailPanel,
  loadOrders,
  loadOrdersApi,
  orderPage,
  orderResponse,
  statusesIn,
  summary,
  type OrderDetailState,
  type OrderStatus,
  type OrderTargetStatus,
} from './support/orders-contract';

// TK-06.4 · /dashboard/orders de punta a punta en Node (sin DOM) con el router REAL y el loader REAL de la ruta, y el
// panel de detalle renderizado por separado (el Drawer usa un portal y no aparece en renderToString).
// Spec 04 F-3..F-6, DP-02; spec 05 §16.4, §16.5 (ESC-41, 42, 43 en nivel U). Matriz: docs/qa/TK-06.4-matrix.md.
// El cableado de botones y la confirmación de cancelar se prueban en e2e/esc-43-order-conflict.spec.ts.

const app = await bootProductsApp({ bootPath: '/dashboard', stored: makeSession(3_600_000, 'token-qa') });
const { router, store } = app;

const TECH_DETAIL = 'PrismaClientKnownRequestError: connect ECONNREFUSED 127.0.0.1:5432';
const networkFailure = (): never => {
  throw new TypeError('fetch failed');
};
const TECHNICAL_FAILURES: [string, () => Response][] = [
  ['INTERNAL_ERROR', () => internalError(TECH_DETAIL)],
  ['fallo de red', networkFailure],
];
const leaks = (html: string) => [TECH_DETAIL, 'ECONNREFUSED', 'INTERNAL_ERROR', 'fetch failed', 'TypeError'].some((t) => html.includes(t));
const rows = (html: string) => [...html.matchAll(/data-row-key="(\d+)"/g)].map((m) => Number(m[1]));

async function open(search = ''): Promise<string> {
  await router.navigate(`${ORDERS_PATH}${search}`);
  await app.settle();
  return app.render();
}

/** Datos del loader de la ruta de pedidos (contrato: OrdersLoaderData). */
function loaderData(): { status?: string; detail?: OrderDetailState | null } | undefined {
  const match = router.state.matches.find((m) => m.route.path === ORDERS_PATH);
  return match === undefined ? undefined : (router.state.loaderData[match.route.id] as never);
}

const reload = () => router.revalidate();
const listCalls = () => app.calls.filter((c) => c.method === 'GET' && c.path === '/orders');
const state = () => ({
  path: router.state.location.pathname,
  session: store.getSession() !== null,
  toLogin: app.navigate.includes('/login'),
});
const STAYS = { path: ORDERS_PATH, session: true, toLogin: false };

async function renderPanel(
  panelDetail: OrderDetailState,
  submitting = false,
  onChangeStatus: (t: OrderTargetStatus) => void = () => {},
): Promise<string> {
  const { OrderDetailPanel } = await loadOrderDetailPanel();
  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { App: AntApp, ConfigProvider } = await import('antd');
  return renderToString(
    createElement(ConfigProvider, null, createElement(AntApp, null, createElement(OrderDetailPanel, { detail: panelDetail, submitting, onChangeStatus }))),
  );
}

beforeEach(async () => {
  if (store.getSession() === null) store.setSession(makeSession(3_600_000, 'token-qa'));
  app.respond(byRoute({ 'GET /products/alerts': () => jsonResponse(200, { items: [] }) }));
  await router.navigate('/dashboard');
  await app.settle();
  app.reset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('QA-06.4-W (spec 05 §15.5, §16.1): loader de datos bajo protectedLoader', () => {
  it('/dashboard/orders tiene un loader propio y es hija directa de la ruta protegida', () => {
    const found = app.findRoute(ORDERS_PATH);
    expect({
      parentIsProtected: found?.parent.loader === app.loaders.protectedLoader,
      childHasLoader: typeof found?.child.loader === 'function',
    }).toEqual({ parentIsProtected: true, childHasLoader: true });
  });
});

describe('QA-06.4-LIST (PE-01; US-06 crit. 6; ESC-32, ESC-33 en presentación): tabla y paginación por servidor', () => {
  it('lee listOrders con token y muestra número, cliente, total y estado en el orden de la API', async () => {
    const newer = summary(100000, 'PENDING');
    const older = summary(99999, 'DELIVERED');
    app.respond(byRoute({ 'GET /orders': () => orderPage([newer, older]) }));

    const html = await open();

    expect({
      calls: callKeys(app.calls),
      authorization: app.calls.map((c) => c.authorization),
      params: listCalls().map(listParams),
      order: rows(html),
      cells: [newer, older].map((o) => {
        const row = rowHtml(html, o.id) ?? '';
        return {
          number: row.includes(o.orderNumber),
          customer: row.includes(o.customer.businessName),
          total: row.includes(o.totalAmount),
          status: statusesIn(row),
        };
      }),
      filter: STATUS_FILTER.test(html),
    }).toEqual({
      calls: ['GET /orders'],
      authorization: ['Bearer token-qa'],
      params: [{ status: null, page: '1', pageSize: '20' }],
      order: [100000, 99999],
      cells: [
        { number: true, customer: true, total: true, status: ['PENDING'] },
        { number: true, customer: true, total: true, status: ['DELIVERED'] },
      ],
      filter: true,
    });
  });

  it.each([
    ['?status=PENDING', { status: 'PENDING', page: '1', pageSize: '20' }],
    ['?status=PROCESSING&page=2', { status: 'PROCESSING', page: '2', pageSize: '20' }],
  ])('%s: el filtro y la página se envían a la API', async (search, expected) => {
    app.respond(byRoute({ 'GET /orders': () => orderPage([summary(1, expected.status as OrderStatus)]) }));

    await open(search);

    expect(listCalls().map(listParams)).toEqual([expected]);
  });

  it('página 3 de 45 pedidos: muestra las filas recibidas (sin recortar en el cliente) y marca la página 3', async () => {
    const items = [41, 42, 43, 44, 45].map((id) => summary(id, 'PENDING'));
    app.respond(byRoute({ 'GET /orders': () => orderPage(items, { page: 3, totalItems: 45 }) }));

    const html = await open('?page=3');

    expect({
      params: listCalls().map((c) => listParams(c).page),
      rows: rows(html),
      active: /ant-pagination-item-3 ant-pagination-item-active/.test(html),
    }).toEqual({ params: ['3'], rows: [41, 42, 43, 44, 45], active: true });
  });

  it('parámetros inválidos en la URL: no se envían y no se pide ningún detalle', async () => {
    app.respond(byRoute({ 'GET /orders': () => orderPage([]) }));

    await open('?status=FOO&page=abc&order=..%2Fproducts');

    expect({ calls: callKeys(app.calls), params: listCalls().map(listParams) }).toEqual({
      calls: ['GET /orders'],
      params: [{ status: null, page: '1', pageSize: '20' }],
    });
  });
});

describe('QA-06.4-ESC-41 (spec 05 §16.4 "Cargando" y "Sin resultados"; PE-01 presentación)', () => {
  it('(a) listado pendiente: indicador de carga, sin vacío ni error', async () => {
    const pending = deferred();
    app.respond(byRoute({ 'GET /orders': () => pending.promise }));

    void router.navigate(ORDERS_PATH);
    await app.ticks();
    const html = app.render();

    expect({ calls: callKeys(app.calls), loading: LOADING.test(html), empty: EMPTY_ORDERS.test(html), error: LIST_ERROR.test(html) }).toEqual({
      calls: ['GET /orders'],
      loading: true,
      empty: false,
      error: false,
    });
    pending.resolve(orderPage([]));
    await app.settle();
  });

  it('(b) detalle pendiente: indicador de carga mientras llega getOrder', async () => {
    const pending = deferred();
    app.respond(byRoute({ 'GET /orders': () => orderPage([summary(7, 'PENDING')]), 'GET /orders/7': () => pending.promise }));
    await open();
    app.reset();

    void router.navigate(`${ORDERS_PATH}?order=7`);
    await app.ticks();
    const html = app.render();

    expect({ asked: callKeys(app.calls).includes('GET /orders/7'), loading: LOADING.test(html) }).toEqual({ asked: true, loading: true });
    pending.resolve(orderResponse(detail(7, 'PENDING')));
    await app.settle();
  });

  it.each([
    ['sin pedidos', ''],
    ['filtro sin resultados', '?status=DELIVERED'],
  ])('(c) %s: mensaje de vacío, sin filas ni error', async (_, search) => {
    app.respond(byRoute({ 'GET /orders': () => orderPage([]) }));

    const html = await open(search);

    expect({ empty: EMPTY_ORDERS.test(html), rows: rows(html), error: LIST_ERROR.test(html) }).toEqual({ empty: true, rows: [], error: false });
  });

  it('(d) página fuera de rango: lista vacía con los totales, y la paginación permite volver', async () => {
    app.respond(byRoute({ 'GET /orders': () => orderPage([], { page: 9, totalItems: 45 }) }));

    const html = await open('?page=9');

    expect({ empty: EMPTY_ORDERS.test(html), rows: rows(html), canGoBack: /ant-pagination-item-1\b/.test(html) }).toEqual({
      empty: true,
      rows: [],
      canGoBack: true,
    });
  });
});

describe('QA-06.4-DET (PE-01; ESC-34 en presentación): pedido abierto desde la URL', () => {
  it('?order=7: lee listOrders y getOrder, y entrega el detalle a la pantalla', async () => {
    const order = detail(7, 'PROCESSING');
    app.respond(byRoute({ 'GET /orders': () => orderPage([summary(7, 'PROCESSING')]), 'GET /orders/7': () => orderResponse(order) }));

    await open('?order=7');

    expect({ calls: callKeys(app.calls).sort(), data: loaderData()?.status, detail: loaderData()?.detail }).toEqual({
      calls: ['GET /orders', 'GET /orders/7'],
      data: 'ready',
      detail: { status: 'ready', order },
    });
  });

  it('sin ?order: no se pide ningún detalle', async () => {
    app.respond(byRoute({ 'GET /orders': () => orderPage([summary(7, 'PENDING')]) }));

    await open();

    expect({ calls: callKeys(app.calls), detail: loaderData()?.detail }).toEqual({ calls: ['GET /orders'], detail: null });
  });

  it('el panel muestra número, estado, cliente, ítems y total tal como los devuelve la API', async () => {
    const order = detail(7, 'PROCESSING');
    const html = await renderPanel({ status: 'ready', order });
    const expected = [
      order.orderNumber,
      order.customer.businessName,
      order.customer.taxId,
      order.customer.phone,
      ...order.items.flatMap((i) => [i.productName, i.unitPrice, i.subtotal]),
      order.totalAmount,
    ];

    expect({
      missing: expected.filter((value) => !html.includes(value)),
      quantities: order.items.filter((i) => !new RegExp(`>\\s*${i.quantity}\\s*<`).test(html)).map((i) => i.quantity),
      status: statusesIn(html),
    }).toEqual({ missing: [], quantities: [], status: ['PROCESSING'] });
  });
});

describe('QA-06.4-BTN (US-06 crit. 4, 5; DP-02): botones del detalle', () => {
  it.each(ALL_STATUSES)('%s: solo ofrece las acciones válidas', async (status) => {
    const html = await renderPanel({ status: 'ready', order: detail(7, status) });

    expect(actionsIn(html)).toEqual([...ACTIONS_BY_STATUS[status]].sort());
  });

  it('con un cambio en curso, todos los botones de acción quedan inhabilitados', async () => {
    const html = await renderPanel({ status: 'ready', order: detail(7, 'PENDING') }, true);
    const buttons = (html.match(/<button\b[^>]*>/g) ?? []).filter((b) => b.includes('data-order-action='));

    expect({ count: buttons.length, enabled: buttons.filter((b) => !/\sdisabled=|ant-btn-loading/.test(b)) }).toEqual({ count: 2, enabled: [] });
  });

  it.each<[string, OrderDetailState, RegExp]>([
    ['error técnico', { status: 'error' }, DETAIL_ERROR],
    ['no encontrado', { status: 'not-found' }, ORDER_GONE],
    ['validación', { status: 'invalid', message: 'orderId: no válido.' }, /orderId: no válido\./],
  ])('detalle con %s: mensaje y ninguna acción', async (_, panelDetail, message) => {
    const html = await renderPanel(panelDetail);

    expect({ message: message.test(html), actions: actionsIn(html) }).toEqual({ message: true, actions: [] });
  });
});

describe('QA-06.4-ESC-42 (D-09; spec 05 §16.4 "Error técnico")', () => {
  it.each(TECHNICAL_FAILURES)('listado con %s: mensaje genérico sin detalles, sin filas y con la sesión activa', async (_, failure) => {
    app.respond(byRoute({ 'GET /orders': failure }));

    const html = await open();

    expect({ error: LIST_ERROR.test(html), empty: EMPTY_ORDERS.test(html), leaks: leaks(html), rows: rows(html), ...state() }).toEqual({
      error: true,
      empty: false,
      leaks: false,
      rows: [],
      ...STAYS,
    });
  });

  it('tras una carga correcta, una recarga fallida no deja las filas anteriores', async () => {
    let fail = false;
    app.respond(byRoute({ 'GET /orders': () => (fail ? internalError(TECH_DETAIL) : orderPage([summary(7, 'PENDING')])) }));
    expect(rows(await open())).toEqual([7]); // precondición

    fail = true;
    await reload();
    await app.settle();
    const html = app.render();

    expect({ rows: rows(html), error: LIST_ERROR.test(html) }).toEqual({ rows: [], error: true });
  });

  it.each(TECHNICAL_FAILURES)('detalle con %s: estado de error sin el detalle anterior; el listado sigue', async (_, failure) => {
    let fail = false;
    app.respond(
      byRoute({
        'GET /orders': () => orderPage([summary(7, 'PENDING')]),
        'GET /orders/7': () => (fail ? failure() : orderResponse(detail(7, 'PENDING'))),
      }),
    );
    await open('?order=7');
    expect(loaderData()?.detail?.status).toBe('ready'); // precondición

    fail = true;
    await reload();
    await app.settle();
    const html = app.render();

    expect({ detail: loaderData()?.detail, rows: rows(html), leaks: leaks(html), ...state() }).toEqual({
      detail: { status: 'error' },
      rows: [7],
      leaks: false,
      ...STAYS,
    });
  });
});

describe('QA-06.4-VAL (spec 05 §16.4 "Error de validación", §16.5)', () => {
  it('VALIDATION_ERROR del listado: muestra el mensaje de la API, sin error técnico ni cierre de sesión', async () => {
    app.respond(byRoute({ 'GET /orders': () => apiError(422, 'VALIDATION_ERROR', 'page: fuera de rango permitido.') }));

    const html = await open('?page=999999999');

    expect({ message: html.includes('page: fuera de rango permitido.'), technical: LIST_ERROR.test(html), ...state() }).toEqual({
      message: true,
      technical: false,
      ...STAYS,
    });
  });
});

describe('QA-06.4-NF (spec 05 §16.4 "Recurso no encontrado"): ORDER_NOT_FOUND', () => {
  it('abrir un pedido inexistente: informa en el detalle y muestra el listado recién leído', async () => {
    app.respond(
      byRoute({
        'GET /orders': () => orderPage([summary(8, 'PENDING')]),
        'GET /orders/999': () => apiError(404, 'ORDER_NOT_FOUND', 'El pedido no existe.'),
      }),
    );

    const html = await open('?order=999');

    expect({ detail: loaderData()?.detail, rows: rows(html), calls: callKeys(app.calls).sort(), ...state() }).toEqual({
      detail: { status: 'not-found' },
      rows: [8],
      calls: ['GET /orders', 'GET /orders/999'],
      ...STAYS,
    });
  });
});

describe('QA-06.4-AUTH (AU-03, CA-11; spec 05 §15.6): UNAUTHORIZED', () => {
  const unauthorized = () => apiError(401, 'UNAUTHORIZED', 'Sesión no válida o expirada.');
  const lost = () => ({
    path: router.state.location.pathname,
    session: store.getSession(),
    redirects: app.navigate.filter((to) => to === '/login').length,
  });
  const LOST = { path: '/login', session: null, redirects: 1 };

  it.each<[string, string, Record<string, () => Response>]>([
    ['listOrders', '', { 'GET /orders': unauthorized }],
    ['getOrder', '?order=7', { 'GET /orders': () => orderPage([summary(7, 'PENDING')]), 'GET /orders/7': unauthorized }],
    ['ambas lecturas', '?order=7', { 'GET /orders': unauthorized, 'GET /orders/7': unauthorized }],
  ])('en %s: descarta el token y redirige una sola vez a /login', async (_, search, table) => {
    app.respond(byRoute(table));

    await router.navigate(`${ORDERS_PATH}${search}`);
    await app.settle();

    expect({ asked: listCalls().length, ...lost() }).toEqual({ asked: 1, ...LOST });
  });

  it('en changeOrderStatus: redirige a /login sin recargar la pantalla', async () => {
    const api = await loadOrdersApi();
    const { runOrderAction } = await loadOrders();
    app.respond(
      byRoute({
        'GET /orders': () => orderPage([summary(7, 'PENDING')]),
        'GET /orders/7': () => orderResponse(detail(7, 'PENDING')),
        'PATCH /orders/7/status': unauthorized,
      }),
    );
    await open('?order=7');
    app.reset();

    const result = await runOrderAction(() => api.changeOrderStatus(7, 'PROCESSING'), reload);
    await app.settle();

    expect({ kind: result.ok ? 'ok' : result.error.kind, calls: callKeys(app.calls), ...lost() }).toEqual({
      kind: 'session',
      calls: ['PATCH /orders/7/status'],
      ...LOST,
    });
  });
});

describe('QA-06.4-CHG (PE-02; US-06 crit. 4, 5; ESC-43): cambiar el estado con las funciones reales y el loader real', () => {
  /** Servidor simulado de un pedido: la lista y el detalle reflejan su estado vigente. */
  function server(initial: OrderStatus, patch: (set: (s: OrderStatus | null) => void) => Response): Responder {
    let current: OrderStatus | null = initial;
    return byRoute({
      'GET /orders': () => orderPage(current === null ? [] : [summary(7, current)]),
      'GET /orders/7': () => (current === null ? apiError(404, 'ORDER_NOT_FOUND', 'El pedido no existe.') : orderResponse(detail(7, current))),
      'PATCH /orders/7/status': () =>
        patch((s) => {
          current = s;
        }),
    });
  }

  async function change(initial: OrderStatus, target: OrderTargetStatus, patch: Parameters<typeof server>[1]) {
    const api = await loadOrdersApi();
    const { runOrderAction } = await loadOrders();
    app.respond(server(initial, patch));
    await open('?order=7');
    app.reset();

    const result = await runOrderAction(() => api.changeOrderStatus(7, target), reload);
    await app.settle();
    const html = app.render();
    const now = loaderData()?.detail;

    return {
      result: result.ok ? 'ok' : result.error.kind,
      first: callKeys(app.calls)[0],
      body: app.calls[0]?.body,
      reread: callKeys(app.calls).slice(1).sort(),
      rowStatus: statusesIn(rowHtml(html, 7)),
      detail: now?.status === 'ready' ? now.order.status : now?.status,
      actions: now ? actionsIn(await renderPanel(now)) : null,
      ...state(),
    };
  }

  const sent = (target: OrderTargetStatus) => ({
    first: 'PATCH /orders/7/status',
    body: { status: target },
    reread: ['GET /orders', 'GET /orders/7'],
    ...STAYS,
  });

  it('avance aceptado: envía solo el destino y actualiza fila, detalle y acciones', async () => {
    const outcome = await change('PENDING', 'PROCESSING', (set) => {
      set('PROCESSING');
      return orderResponse(detail(7, 'PROCESSING'));
    });

    expect(outcome).toEqual({
      ...sent('PROCESSING'),
      result: 'ok',
      rowStatus: ['PROCESSING'],
      detail: 'PROCESSING',
      actions: ['CANCELLED', 'DISPATCHED'],
    });
  });

  it('ESC-43 INVALID_ORDER_TRANSITION: informa el conflicto, recarga el pedido real y la sesión sigue activa', async () => {
    const outcome = await change('PENDING', 'CANCELLED', (set) => {
      set('DISPATCHED'); // otro cambio llegó antes
      return apiError(409, 'INVALID_ORDER_TRANSITION', 'El pedido está DISPATCHED y no se puede cancelar.');
    });

    expect(outcome).toEqual({
      ...sent('CANCELLED'),
      result: 'conflict',
      rowStatus: ['DISPATCHED'],
      detail: 'DISPATCHED',
      actions: ['DELIVERED'],
    });
  });

  it('ORDER_NOT_FOUND al cambiar: informa y recarga la lista', async () => {
    const outcome = await change('PENDING', 'PROCESSING', (set) => {
      set(null);
      return apiError(404, 'ORDER_NOT_FOUND', 'El pedido no existe.');
    });

    expect(outcome).toEqual({ ...sent('PROCESSING'), result: 'not-found', rowStatus: [], detail: 'not-found', actions: [] });
  });

  it('fallo de red al cambiar: resultado incierto, se vuelve a leer el estado vigente', async () => {
    const outcome = await change('PROCESSING', 'DISPATCHED', (set) => {
      set('DISPATCHED'); // el backend aplicó el cambio, pero la respuesta se perdió
      return networkFailure();
    });

    expect(outcome).toEqual({
      ...sent('DISPATCHED'),
      result: 'technical',
      rowStatus: ['DISPATCHED'],
      detail: 'DISPATCHED',
      actions: ['DELIVERED'],
    });
  });
});
