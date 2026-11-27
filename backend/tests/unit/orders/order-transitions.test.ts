import { AppError } from '../../../src/lib/app-error';
import { createOrderService, OrderInputError } from '../../../src/modules/orders/orders.service';

// Pruebas de aceptación de TK-06.1 · transiciones de estado del pedido por el operador (spec 04 §4.2, D-06, D-07, F-4, F-5;
// ESC-16..ESC-18, ESC-20, ESC-21, ESC-24; CA-12 (a), (b); RN-05). Nivel U: sin base de datos.
// El servicio real se ejercita contra un Prisma doble con estado en memoria que implementa la semántica de PostgreSQL que
// importa aquí: las actualizaciones condicionales (`WHERE id AND status …`) solo afectan filas que cumplen el filtro y una
// transacción que falla se revierte entera. Así el resultado de cada combinación lo decide el servicio, no una tabla copiada.
// La tabla `ALLOWED` de abajo es el ORÁCULO de la prueba (spec 04 §4.2), no una réplica de la lógica del servicio.
// Matriz: docs/qa/TK-06.1-matrix.md.

type Status = 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
const ORIGINS: Status[] = ['PENDING', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];
const TARGETS: Status[] = ['PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];

// Oráculo: spec 04 §4.2 (tabla origen → destino permitido del operador).
const ALLOWED: Record<Status, Status[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const ORDER_ID = 7;
const ORDER_NUMBER = 'MED-00007';
// Ítems en desorden a propósito; el stock inicial de cada producto es 100.
const ITEMS = [
  { productId: 2, quantity: 3 },
  { productId: 1, quantity: 2 },
];

interface FakeState {
  order: { id: number; orderNumber: string; status: Status } | null;
  stock: Map<number, number>;
}

function fakePrisma(initial: Status | null) {
  const state: FakeState = {
    order: initial === null ? null : { id: ORDER_ID, orderNumber: ORDER_NUMBER, status: initial },
    stock: new Map(ITEMS.map((i) => [i.productId, 100])),
  };

  const statusMatches = (filter: unknown, current: Status): boolean => {
    if (filter === undefined) return true;
    if (typeof filter === 'string') return filter === current;
    const f = filter as { in?: Status[]; equals?: Status; not?: Status };
    if (f.in !== undefined) return f.in.includes(current);
    if (f.equals !== undefined) return f.equals === current;
    if (f.not !== undefined) return f.not !== current;
    return true;
  };
  const matches = (where: { id?: number; status?: unknown } | undefined): boolean =>
    state.order !== null &&
    (where?.id === undefined || where.id === state.order.id) &&
    statusMatches(where?.status, state.order.status);
  const view = () => (state.order === null ? null : { ...state.order, items: ITEMS.map((i) => ({ ...i })) });
  const notFoundError = () => Object.assign(new Error('Record not found'), { code: 'P2025' });

  const applyStock = (args: { where?: { id?: number }; data: { currentStock?: { increment?: number } } }) => {
    const id = args.where?.id;
    const inc = args.data.currentStock?.increment;
    if (id === undefined || inc === undefined || !state.stock.has(id)) return { count: 0 };
    state.stock.set(id, (state.stock.get(id) ?? 0) + inc);
    return { count: 1 };
  };

  const prisma = {
    order: {
      async updateMany(args: { where?: { id?: number; status?: unknown }; data: { status?: Status } }) {
        if (!matches(args.where) || state.order === null) return { count: 0 };
        if (args.data.status !== undefined) state.order.status = args.data.status;
        return { count: 1 };
      },
      async update(args: { where?: { id?: number; status?: unknown }; data: { status?: Status } }) {
        if (!matches(args.where) || state.order === null) throw notFoundError();
        if (args.data.status !== undefined) state.order.status = args.data.status;
        return view();
      },
      async findUnique(args: { where?: { id?: number; status?: unknown } }) {
        return matches(args.where) ? view() : null;
      },
      async findFirst(args: { where?: { id?: number; status?: unknown } }) {
        return matches(args.where) ? view() : null;
      },
      async findUniqueOrThrow(args: { where?: { id?: number; status?: unknown } }) {
        if (!matches(args.where)) throw notFoundError();
        return view();
      },
      async count(args: { where?: { id?: number; status?: unknown } } = {}) {
        return matches(args.where) ? 1 : 0;
      },
    },
    orderItem: {
      async findMany() {
        return state.order === null ? [] : ITEMS.map((i) => ({ ...i }));
      },
    },
    product: {
      async update(args: { where?: { id?: number }; data: { currentStock?: { increment?: number } } }) {
        const r = applyStock(args);
        if (r.count === 0) throw notFoundError();
        return { id: args.where?.id };
      },
      updateMany: async (args: { where?: { id?: number }; data: { currentStock?: { increment?: number } } }) => applyStock(args),
    },
    // Una transacción que lanza se revierte entera, como en PostgreSQL.
    async $transaction(fn: (tx: unknown) => Promise<unknown>) {
      const snapshot = { order: state.order === null ? null : { ...state.order }, stock: new Map(state.stock) };
      try {
        return await fn(prisma);
      } catch (err) {
        state.order = snapshot.order;
        state.stock = snapshot.stock;
        throw err;
      }
    },
  };
  return { prisma, state };
}

function setup(initial: Status | null) {
  const fake = fakePrisma(initial);
  const service = createOrderService({ prisma: fake.prisma as never }) as unknown as {
    changeOrderStatus(orderId: number, target: unknown): Promise<unknown>;
  };
  return { ...fake, service };
}

const initialStock = () => new Map(ITEMS.map((i) => [i.productId, 100]));

/** Etiqueta de escenario de la combinación, para el nombre del test. */
function scenarioTag(from: Status, to: Status): string {
  if (ALLOWED[from].includes(to)) return to === 'CANCELLED' ? 'ESC-22 / CA-12 (a)' : 'ESC-16';
  if (from === to) return from === 'DELIVERED' || from === 'CANCELLED' ? 'ESC-21, D-06' : 'ESC-20, D-06';
  if (from === 'DELIVERED' || from === 'CANCELLED') return 'ESC-21';
  if (to === 'CANCELLED') return 'ESC-24 / CA-12 (b)';
  if (from === 'PENDING') return 'ESC-17';
  if (from === 'DISPATCHED' && to === 'PROCESSING') return 'ESC-18';
  return 'RN-05';
}

const combinations = ORIGINS.flatMap((from) => TARGETS.map((to) => [from, to] as [Status, Status]));

describe('TK-06.1 · RN-05 / D-06 / D-07 · las 20 combinaciones origen × destino del operador contra el servicio real', () => {
  test('el oráculo cubre 5 orígenes × 4 destinos', () => {
    expect(combinations).toHaveLength(20);
  });

  test.each(combinations)('%s → %s', async (from, to) => {
    const { service, state } = setup(from);
    const allowed = ALLOWED[from].includes(to);

    const outcome = await service.changeOrderStatus(ORDER_ID, to).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    // Nombre de escenario en el mensaje de fallo para trazabilidad.
    const tag = scenarioTag(from, to);
    if (allowed) {
      expect({ tag, outcome }).toEqual({ tag, outcome: { ok: true, value: { id: ORDER_ID, orderNumber: ORDER_NUMBER, status: to } } });
      expect(state.order?.status).toBe(to);
      // D-07: solo CANCELLED toca el stock, y restituye exactamente la cantidad de cada ítem una vez.
      const expected = initialStock();
      if (to === 'CANCELLED') for (const i of ITEMS) expected.set(i.productId, 100 + i.quantity);
      expect(state.stock).toEqual(expected);
    } else {
      expect({ tag, ok: outcome.ok }).toEqual({ tag, ok: false });
      const error = (outcome as { error: unknown }).error;
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ status: 409, code: 'INVALID_ORDER_TRANSITION' });
      expect(state.order?.status).toBe(from); // sin cambios en el pedido
      expect(state.stock).toEqual(initialStock()); // ni en el stock
    }
  });
});

describe('TK-06.1 · pedido inexistente (técnica; spec 04 F-4 paso 4, F-5 paso 2.2)', () => {
  test.each(TARGETS)('destino %s sobre un id inexistente: AppError 404 ORDER_NOT_FOUND, sin cambios', async (to) => {
    const { service, state } = setup(null);

    const error = await service.changeOrderStatus(ORDER_ID, to).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 404, code: 'ORDER_NOT_FOUND' });
    expect(state.order).toBeNull();
    expect(state.stock).toEqual(initialStock());
  });
});

describe('TK-06.1 · entrada inválida (P3): destino PENDING o fuera del enum → OrderInputError sin tocar la base', () => {
  const invalidTargets: [string, unknown][] = [
    ['PENDING', 'PENDING'],
    ['una cadena fuera del enum (SHIPPED)', 'SHIPPED'],
    ['cadena vacía', ''],
    ['minúsculas (processing)', 'processing'],
    ['null', null],
    ['undefined', undefined],
    ['un número', 42],
    ['un objeto', {}],
  ];

  test.each(invalidTargets)('destino %s: lanza OrderInputError (no AppError), sin transacción ni consultas', async (_name, target) => {
    const accesses: string[] = [];
    const prisma = new Proxy(
      {},
      {
        get(_t, prop) {
          accesses.push(String(prop));
          return () => {
            throw new Error(`Acceso inesperado a prisma.${String(prop)}`);
          };
        },
      },
    );
    const service = createOrderService({ prisma: prisma as never }) as unknown as {
      changeOrderStatus(orderId: number, target: unknown): Promise<unknown>;
    };
    accesses.length = 0; // lo que ocurra al construir el servicio no cuenta

    const error = await service.changeOrderStatus(ORDER_ID, target).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(OrderInputError);
    expect(error).not.toBeInstanceOf(AppError);
    expect(accesses).toEqual([]);
  });
});
