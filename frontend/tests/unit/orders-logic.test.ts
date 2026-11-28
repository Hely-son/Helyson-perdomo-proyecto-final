import { describe, expect, it, jest } from '@jest/globals';
import { ApiError, NoSessionError, SessionExpiredError } from '../../src/api/client';
import { ACTIONS_BY_STATUS, ALL_STATUSES, loadOrders, type OrdersQuery } from './support/orders-contract';

// TK-06.4 · lógica pura de la pantalla de pedidos (src/orders/orders.ts): acciones por estado (RN-05, DP-02), filtro y
// página en la URL (PE-01) y clasificación de errores por `code` (spec 05 §16.5). Matriz: docs/qa/TK-06.4-matrix.md.

const query = (q: Partial<OrdersQuery> = {}): OrdersQuery => ({ status: null, page: 1, orderId: null, ...q });
const apiError = (status: number, code: string | null, message = 'detalle del servidor') => new ApiError(status, code, message);

describe('QA-06.4-ACT (US-06 crit. 4, 5; RN-05; DP-02): acciones ofrecidas por estado', () => {
  it.each(ALL_STATUSES)('%s: solo las transiciones válidas del operador', async (status) => {
    const { availableOrderActions } = await loadOrders();
    expect([...availableOrderActions(status)].sort()).toEqual([...ACTIONS_BY_STATUS[status]].sort());
  });
});

describe('QA-06.4-QRY (PE-01; US-06 crit. 6): filtro, página y pedido abierto en la URL', () => {
  const parse = async (search: string) => (await loadOrders()).parseOrdersQuery(new URLSearchParams(search));

  it('sin parámetros: sin filtro, página 1 y ningún pedido abierto', async () => {
    expect(await parse('')).toEqual(query());
  });

  it('lee status, page y order', async () => {
    expect(await parse('status=PROCESSING&page=3&order=42')).toEqual(query({ status: 'PROCESSING', page: 3, orderId: 42 }));
  });

  it.each(['status=FOO', 'status=pending', 'page=0', 'page=-1', 'page=1.5', 'page=abc', 'order=0', 'order=-2', 'order=abc', 'order=..%2F..%2Fproducts', 'order=7%2Fstatus'])(
    'valor inválido %s: se descarta y no llega a la API',
    async (search) => {
      expect(await parse(search)).toEqual(query());
    },
  );

  it('ordersSearch es la inversa de parseOrdersQuery', async () => {
    const { ordersSearch, parseOrdersQuery } = await loadOrders();
    const queries = [query(), query({ status: 'CANCELLED' }), query({ page: 4 }), query({ status: 'PENDING', page: 2, orderId: 9 })];
    expect(queries.map((q) => parseOrdersQuery(new URLSearchParams(ordersSearch(q))))).toEqual(queries);
  });

  it('cambiar o quitar el filtro vuelve a la página 1', async () => {
    const { withStatusFilter } = await loadOrders();
    const from = query({ status: 'PENDING', page: 3 });
    expect([withStatusFilter(from, 'DELIVERED'), withStatusFilter(from, null)].map((q) => [q.status, q.page])).toEqual([
      ['DELIVERED', 1],
      [null, 1],
    ]);
  });
});

describe('QA-06.4-ERR (ESC-42, ESC-43; D-09; spec 05 §16.5): clasificación por code', () => {
  const classify = async (error: unknown) => (await loadOrders()).classifyOrderError(error);

  it.each([
    ['UNAUTHORIZED', apiError(401, 'UNAUTHORIZED')],
    ['sesión vencida localmente', new SessionExpiredError()],
    ['sin sesión', new NoSessionError()],
  ])('%s: sesión perdida', async (_, error) => {
    expect(await classify(error)).toEqual({ kind: 'session' });
  });

  it('INVALID_ORDER_TRANSITION: conflicto, avisa que el estado cambió y pide recargar', async () => {
    expect(await classify(apiError(409, 'INVALID_ORDER_TRANSITION'))).toEqual({
      kind: 'conflict',
      reload: true,
      message: expect.stringMatching(/estado[^.]*cambi/i),
    });
  });

  it('ORDER_NOT_FOUND: informa sobre el pedido y pide recargar', async () => {
    expect(await classify(apiError(404, 'ORDER_NOT_FOUND'))).toEqual({
      kind: 'not-found',
      reload: true,
      message: expect.stringMatching(/pedido/i),
    });
  });

  it('VALIDATION_ERROR: muestra el mensaje de la API', async () => {
    expect(await classify(apiError(422, 'VALIDATION_ERROR', 'status: valor no permitido.'))).toEqual({
      kind: 'validation',
      message: 'status: valor no permitido.',
    });
  });

  it.each([
    ['fallo de red', apiError(0, null, 'No se pudo conectar con el servidor.')],
    ['INTERNAL_ERROR', apiError(500, 'INTERNAL_ERROR', 'PrismaClientKnownRequestError ECONNREFUSED')],
    ['409 con otro code (no se decide por status)', apiError(409, 'STOCK_CHANGED', 'ECONNREFUSED')],
    ['error no previsto', new TypeError('ECONNREFUSED')],
  ])('%s: técnico, mensaje genérico sin detalles', async (_, error) => {
    const outcome = await classify(error);
    expect(outcome.kind).toBe('technical');
    const message = 'message' in outcome ? outcome.message : '';
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(/ECONNREFUSED|Prisma|INTERNAL_ERROR|STOCK_CHANGED|TypeError/);
  });
});

describe('QA-06.4-RUN (TK-06.4 "Hecho cuando"; DP-02): recarga tras cambiar un estado', () => {
  async function run(action: () => Promise<unknown>) {
    const { runOrderAction } = await loadOrders();
    const reload = jest.fn();
    const result = await runOrderAction(action, reload);
    return { ok: result.ok, kind: result.ok ? null : result.error.kind, reloads: reload.mock.calls.length };
  }
  const fail = (error: unknown) => () => Promise.reject(error);

  it('éxito: recarga una vez', async () => {
    expect(await run(() => Promise.resolve({}))).toEqual({ ok: true, kind: null, reloads: 1 });
  });

  it.each([
    ['conflict', apiError(409, 'INVALID_ORDER_TRANSITION')],
    ['not-found', apiError(404, 'ORDER_NOT_FOUND')],
    ['technical', apiError(0, null)], // fallo de red: el resultado es incierto, se vuelve a leer
  ])('%s: no rechaza y recarga una vez', async (kind, error) => {
    expect(await run(fail(error))).toEqual({ ok: false, kind, reloads: 1 });
  });

  it('sesión perdida: no recarga (el flujo de sesión redirige a /login)', async () => {
    expect(await run(fail(apiError(401, 'UNAUTHORIZED')))).toEqual({ ok: false, kind: 'session', reloads: 0 });
  });
});
