import { ChatSessionStore } from '../../../src/modules/chat/session-store';

// TK-05.2 · QA fase 2 (reverificación del hallazgo 1): un segundo mensaje que llega mientras el primero sigue en procesamiento,
// cuando por reloj ya se superó el TTL desde el último mensaje procesado, queda en cola; la sesión no se invalida ni se elimina; el
// plazo no se renueva al recibir el segundo (solo al terminar el primero, DP-06) y el segundo se procesa con el carrito intacto.
// Prueba de regresión nueva: no modifica las de session-store-busy.test.ts ni las de session-store.test.ts.
// Solo API pública de ChatSessionStore; reloj controlado con fake timers de Jest; sin red ni base de datos.
// Para no alterar la sesión durante la prueba, el estado se observa con `size` y con la referencia devuelta por `create`
// (`get` descartaría una sesión expirada).
// Matriz: docs/qa/TK-05.2-matrix.md

type Store = ChatSessionStore<string, string[]>;

const MIN = 60_000;
const T0 = new Date('2026-03-01T12:00:00.000Z');

const stores: Store[] = [];
function makeStore(ttlMinutes = 30): Store {
  const store: Store = new ChatSessionStore<string, string[]>({ ttlMinutes });
  stores.push(store);
  return store;
}
const advance = (ms: number) => jest.advanceTimersByTime(ms);
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'], now: T0 });
});
afterEach(() => {
  for (const store of stores.splice(0)) store.stopSweep();
  jest.useRealTimers();
});

describe('TK-05.2 · D-3 · segundo mensaje con el primero activo y el TTL superado por reloj', () => {
  test.each([
    ['con el barrido corriendo, TTL superado por 1 min', true, 2],
    ['sin barrido, TTL superado de sobra (45 min)', false, 16],
  ])(
    'D-3 · %s: el segundo mensaje queda en cola, la sesión no se invalida ni se elimina, el plazo no se renueva al recibirlo y, al terminar el primero, ambos se procesan con el carrito intacto',
    async (_name, sweeping, extraMinutes) => {
      const store = makeStore(30);
      const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: ['A', 'B'] });
      if (sweeping) store.startSweep();
      advance(29 * MIN); // vigente: 1 min para expirar

      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const order: string[] = [];
      const first = store.process(session.id, async () => {
        order.push('first:start');
        await gate; // manejador asíncrono que se demora
        order.push('first:end');
      });
      await flush();
      expect(order).toEqual(['first:start']);

      advance(extraMinutes * MIN); // se alcanza y supera el TTL por reloj con el primer mensaje aún activo
      const secondHandler = jest.fn(async (s: { cart: string[] }) => {
        order.push('second');
        return [...s.cart];
      });
      const second = store.process(session.id, secondHandler); // llega mientras el primero sigue activo

      await flush();
      expect(store.size).toBe(1); // no se invalidó ni se eliminó
      expect(secondHandler).not.toHaveBeenCalled(); // en cola: espera su turno
      expect(session.lastProcessedAt).toBe(T0.getTime()); // recibir el segundo no renovó el plazo
      expect(session.cart).toEqual(['A', 'B']);
      if (sweeping) advance(1 * MIN); // otro barrido con la sesión ocupada
      expect(store.size).toBe(1);

      const finishedAt = Date.now();
      release();
      await expect(first).resolves.toEqual({ status: 'processed', result: undefined });
      await expect(second).resolves.toEqual({ status: 'processed', result: ['A', 'B'] }); // carrito intacto
      expect(order).toEqual(['first:start', 'first:end', 'second']);
      expect(session.lastProcessedAt).toBe(finishedAt); // renovada al terminar (DP-06)
      expect(store.get(session.id)).toBe(session);
      expect(store.size).toBe(1);
    },
  );

  test('D-3 (b, g) · guardas: una sesión expirada sin mensajes en curso se invalida y elimina al recibir, y la barre el barrido', async () => {
    const store = makeStore(30);
    const received = store.create({ customerId: 1, state: 'MAIN_MENU', cart: ['A'] });
    const swept = store.create({ customerId: 2, state: 'MAIN_MENU', cart: ['B'] });
    advance(30 * MIN + 1);
    const handler = jest.fn();
    await expect(store.process(received.id, handler)).resolves.toEqual({ status: 'invalid' }); // (b)
    expect(handler).not.toHaveBeenCalled();
    expect(store.size).toBe(1); // eliminada al recibir

    store.startSweep();
    advance(1 * MIN); // (g)
    expect(store.size).toBe(0);
    expect(store.get(swept.id)).toBeUndefined();
  });
});
