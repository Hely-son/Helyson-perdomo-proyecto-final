import { ChatSessionStore } from '../../../src/modules/chat/session-store';

// TK-05.7 · Pruebas de aceptación de QA (fase 1). Spec 03 §4.1, F-2, F-7 (DP-06, DP-08, DP-09),
// ESC-11, ESC-13, ESC-45 (solo la regla de renovación), ESC-46; decisiones D-1 a D-3 de la puerta 1.
// El almacén es genérico: aquí el estado de conversación es `string` y el carrito `string[]`.
// Reloj controlado con los fake timers de Jest (simulan Date y los temporizadores); sin red ni base de datos.
// Matriz: docs/qa/TK-05.7-matrix.md

type State = string;
type Cart = string[];
type Store = ChatSessionStore<State, Cart>;

const MIN = 60_000;
const T0 = new Date('2026-03-01T12:00:00.000Z');

const stores: Store[] = [];
function makeStore(ttlMinutes = 30): Store {
  const store = new ChatSessionStore<State, Cart>({ ttlMinutes });
  stores.push(store);
  return store;
}
const advance = (ms: number) => jest.advanceTimersByTime(ms);
// Deja correr las promesas pendientes (setImmediate no está simulado).
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'], now: T0 });
});

afterEach(() => {
  for (const store of stores.splice(0)) store.stopSweep();
  jest.useRealTimers();
});

describe('TK-05.7 · creación y lectura (spec 03 §4.1)', () => {
  test('create guarda cliente, estado, carrito y hora del último mensaje con un id UUID', () => {
    const store = makeStore();
    const session = store.create({ customerId: 7, state: 'MAIN_MENU', cart: [] });

    expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(session.customerId).toBe(7);
    expect(session.state).toBe('MAIN_MENU');
    expect(session.cart).toEqual([]);
    expect(session.lastProcessedAt).toBe(T0.getTime());
    expect(store.size).toBe(1);
  });

  test('get devuelve la sesión creada; un id desconocido devuelve undefined', () => {
    const store = makeStore();
    const session = store.create({ customerId: 7, state: 'MAIN_MENU', cart: [] });

    expect(store.get(session.id)).toBe(session);
    expect(store.get('00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });

  test('process sobre un id inexistente no invoca el manejador y responde sesión inválida (ESC-09 a nivel de almacén)', async () => {
    const store = makeStore();
    const handler = jest.fn();

    const result = await store.process('00000000-0000-4000-8000-000000000000', handler);

    expect(result).toEqual({ status: 'invalid' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('TK-05.7 · expiración por inactividad (CH-11, F-2, D-3c)', () => {
  test('inactividad exactamente igual al TTL: la sesión sigue vigente (get y process)', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });

    advance(30 * MIN);

    expect(store.get(session.id)).toBe(session);
    const handler = jest.fn().mockResolvedValue('ok');
    await expect(store.process(session.id, handler)).resolves.toEqual({ status: 'processed', result: 'ok' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('inactividad de TTL + 1 ms: get devuelve undefined y la sesión se descarta de memoria', () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: ['A'] });

    advance(30 * MIN + 1);

    expect(store.get(session.id)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  test('process sobre una sesión expirada no invoca el manejador y descarta la sesión con su carrito', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'CATALOG', cart: ['A', 'A', 'B'] });
    const handler = jest.fn();

    advance(30 * MIN + 1);
    const result = await store.process(session.id, handler);

    expect(result).toEqual({ status: 'invalid' });
    expect(handler).not.toHaveBeenCalled();
    expect(store.get(session.id)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  test('el TTL es configurable: con 5 minutos, 5 min siguen vigentes y 5 min + 1 ms expiran', () => {
    const store = makeStore(5);
    const a = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });

    advance(5 * MIN);
    expect(store.get(a.id)).toBe(a);

    advance(1);
    expect(store.get(a.id)).toBeUndefined();
  });
});

describe('TK-05.7 · renovación del plazo (DP-06, ESC-11, ESC-45)', () => {
  test('ESC-11 · TTL 30: mensajes procesados en t=0, t=T−1 min y t=2T−2 min se procesan los tres', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    const handler = jest.fn().mockResolvedValue('ok');

    const first = await store.process(session.id, handler); // t = 0
    advance(29 * MIN);
    const second = await store.process(session.id, handler); // t = T - 1 min
    advance(29 * MIN);
    const third = await store.process(session.id, handler); // t = 2T - 2 min

    for (const result of [first, second, third]) expect(result).toEqual({ status: 'processed', result: 'ok' });
    expect(handler).toHaveBeenCalledTimes(3);
    expect(store.get(session.id)).toBe(session);
  });

  test('ESC-11 · un mensaje procesado actualiza la hora del último mensaje', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });

    advance(10 * MIN);
    await store.process(session.id, async () => undefined);

    expect(session.lastProcessedAt).toBe(T0.getTime() + 10 * MIN);
  });

  test('ESC-45 (renovación) · una entrada inválida que el manejador resuelve con normalidad renueva el plazo: `1` en t=T+1 min se procesa', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });

    advance(29 * MIN);
    // `xyz`: entrada conversacional inválida; para el almacén es un mensaje procesado con éxito.
    await store.process(session.id, async () => 'invalid-input-reply');
    advance(2 * MIN); // t = T + 1 min desde la creación, pero solo 2 min desde la última renovación
    const handler = jest.fn().mockResolvedValue('ok');

    await expect(store.process(session.id, handler)).resolves.toEqual({ status: 'processed', result: 'ok' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('ESC-45 (principio de la regla) · leer la sesión con get no renueva el plazo: `1` en t=T+1 min es sesión inválida', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });

    advance(29 * MIN);
    expect(store.get(session.id)).toBe(session); // lectura sin procesar un mensaje
    advance(2 * MIN);
    const handler = jest.fn();

    await expect(store.process(session.id, handler)).resolves.toEqual({ status: 'invalid' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('D-3b · si el manejador falla no se renueva el plazo: se conserva la hora del último mensaje procesado con éxito', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });

    advance(10 * MIN);
    await store.process(session.id, async () => undefined); // éxito en t = 10 min
    advance(19 * MIN); // t = 29 min
    await expect(
      store.process(session.id, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(session.lastProcessedAt).toBe(T0.getTime() + 10 * MIN);
    expect(store.get(session.id)).toBe(session); // el fallo no descarta una sesión vigente

    advance(21 * MIN); // t = 50 min: 40 min desde el último éxito (> 30); solo 21 desde el fallo
    const handler = jest.fn();
    await expect(store.process(session.id, handler)).resolves.toEqual({ status: 'invalid' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('TK-05.7 · barrido periódico (ESC-13, D-1, D-2)', () => {
  test('ESC-13 · el barrido elimina de memoria las sesiones expiradas y conserva las activas', async () => {
    const store = makeStore(30);
    const expired = store.create({ customerId: 1, state: 'MAIN_MENU', cart: ['A'] });
    const active = store.create({ customerId: 2, state: 'MAIN_MENU', cart: ['B'] });
    store.startSweep();

    advance(20 * MIN);
    await store.process(active.id, async () => undefined); // renovada en t = 20 min
    advance(10 * MIN); // t = 30 min: `expired` lleva exactamente T sin actividad (aún vigente, D-3c)
    expect(store.size).toBe(2);

    advance(1 * MIN); // t = 31 min: el barrido de este minuto elimina a `expired`
    expect(store.size).toBe(1);
    expect(store.get(expired.id)).toBeUndefined();
    expect(store.get(active.id)).toBe(active);
  });

  test('D-1 · el intervalo del barrido es de 1 minuto: con TTL 1 min, una sesión expirada a los 90 s sigue en memoria y se elimina a los 120 s', () => {
    const store = makeStore(1);
    store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    store.startSweep();

    advance(60 * 1000); // barrido 1: inactividad = TTL exacto, vigente
    expect(store.size).toBe(1);

    advance(30 * 1000); // t = 90 s: ya expirada, pero no hubo barrido (no es de 30 s)
    expect(store.size).toBe(1);

    advance(30 * 1000); // t = 120 s: barrido 2
    expect(store.size).toBe(0);
  });

  test('D-2 · sin startSweep no hay barrido; stopSweep detiene el barrido y libera el temporizador', () => {
    const store = makeStore(1);
    store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });

    advance(5 * MIN);
    expect(store.size).toBe(1); // sin barrido iniciado, la sesión expirada sigue en memoria
    expect(jest.getTimerCount()).toBe(0);

    store.startSweep();
    expect(jest.getTimerCount()).toBe(1);
    store.stopSweep();
    expect(jest.getTimerCount()).toBe(0);

    advance(5 * MIN);
    expect(store.size).toBe(1); // detenido: ya no barre
  });
});

describe('TK-05.7 · varias sesiones del mismo cliente (DP-09, ESC-46)', () => {
  test('ESC-46 · dos sesiones del mismo cliente son independientes: cada una conserva solo su carrito', async () => {
    const store = makeStore(30);
    const first = store.create({ customerId: 9, state: 'MAIN_MENU', cart: [] });
    const second = store.create({ customerId: 9, state: 'MAIN_MENU', cart: [] });

    expect(first.id).not.toBe(second.id);
    await store.process(first.id, async (s) => {
      s.cart.push('A', 'A');
    });
    await store.process(second.id, async (s) => {
      s.cart.push('B');
    });

    expect(store.get(first.id)?.cart).toEqual(['A', 'A']);
    expect(store.get(second.id)?.cart).toEqual(['B']);
    expect(store.get(first.id)?.customerId).toBe(9);
    expect(store.get(second.id)?.customerId).toBe(9);
    expect(store.size).toBe(2);
  });

  test('ESC-46 · expirar o renovar una sesión no afecta a la otra del mismo cliente', async () => {
    const store = makeStore(30);
    const first = store.create({ customerId: 9, state: 'MAIN_MENU', cart: ['A'] });
    const second = store.create({ customerId: 9, state: 'MAIN_MENU', cart: ['B'] });

    advance(20 * MIN);
    await store.process(second.id, async () => undefined); // solo renueva la segunda
    advance(11 * MIN); // t = 31 min

    expect(store.get(first.id)).toBeUndefined();
    expect(store.get(second.id)?.cart).toEqual(['B']);
  });
});

describe('TK-05.7 · procesamiento en serie por sesión (DP-08, F-7)', () => {
  test('tres mensajes simultáneos de una misma sesión se procesan de uno en uno, en su orden de llegada', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    const gates = [deferred(), deferred(), deferred()];
    const log: string[] = [];
    const run = (n: number) =>
      store.process(session.id, async () => {
        log.push(`start${n}`);
        await gates[n].promise;
        log.push(`end${n}`);
        return n;
      });

    const results = [run(0), run(1), run(2)];
    await flush();
    expect(log).toEqual(['start0']); // los demás esperan

    gates[0].resolve();
    await flush();
    expect(log).toEqual(['start0', 'end0', 'start1']);

    gates[1].resolve();
    gates[2].resolve();
    await flush();

    expect(log).toEqual(['start0', 'end0', 'start1', 'end1', 'start2', 'end2']);
    await expect(Promise.all(results)).resolves.toEqual([
      { status: 'processed', result: 0 },
      { status: 'processed', result: 1 },
      { status: 'processed', result: 2 },
    ]);
  });

  test('el mensaje que espera se interpreta con el estado ya actualizado por el anterior', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'SUMMARY', cart: ['A'] });
    const gate = deferred();
    let stateSeenBySecond: string | undefined;
    let cartSeenBySecond: string[] | undefined;

    const first = store.process(session.id, async (s) => {
      await gate.promise;
      s.state = 'MAIN_MENU';
      s.cart = [];
    });
    const second = store.process(session.id, async (s) => {
      stateSeenBySecond = s.state;
      cartSeenBySecond = [...s.cart];
    });
    await flush();
    expect(stateSeenBySecond).toBeUndefined(); // aún no corrió

    gate.resolve();
    await Promise.all([first, second]);

    expect(stateSeenBySecond).toBe('MAIN_MENU');
    expect(cartSeenBySecond).toEqual([]);
  });

  test('un mensaje de otra sesión (incluso del mismo cliente) se procesa sin esperar a que termine el de la primera', async () => {
    const store = makeStore(30);
    const slow = store.create({ customerId: 5, state: 'MAIN_MENU', cart: [] });
    const other = store.create({ customerId: 5, state: 'MAIN_MENU', cart: [] }); // mismo cliente
    const stranger = store.create({ customerId: 6, state: 'MAIN_MENU', cart: [] }); // otro cliente
    const gate = deferred();
    const slowDone = jest.fn();

    const slowRun = store.process(slow.id, async () => {
      await gate.promise;
      slowDone();
    });
    const otherRun = store.process(other.id, async () => 'other');
    const strangerRun = store.process(stranger.id, async () => 'stranger');

    await expect(otherRun).resolves.toEqual({ status: 'processed', result: 'other' });
    await expect(strangerRun).resolves.toEqual({ status: 'processed', result: 'stranger' });
    expect(slowDone).not.toHaveBeenCalled(); // la primera sigue en curso

    gate.resolve();
    await slowRun;
    expect(slowDone).toHaveBeenCalledTimes(1);
  });

  test('si un manejador falla, el error llega a su llamador y el siguiente mensaje de la sesión sigue procesándose', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    const gate = deferred();

    const first = store.process(session.id, async () => {
      await gate.promise;
      throw new Error('boom');
    });
    const firstAssertion = expect(first).rejects.toThrow('boom');
    const second = store.process(session.id, async () => 'second');

    gate.resolve();
    await firstAssertion;
    await expect(second).resolves.toEqual({ status: 'processed', result: 'second' });
  });

  test('D-3a · un mensaje en cola comprueba la expiración cuando le llega el turno: si la sesión expiró mientras esperaba, no se procesa y se descarta', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'SUMMARY', cart: ['A'] }); // último mensaje en t = 0
    advance(29 * MIN); // t = T - 1 min: vigente cuando llegan los dos mensajes
    const gate = deferred();
    const secondHandler = jest.fn();

    const first = store.process(session.id, async () => {
      await gate.promise;
      throw new Error('boom'); // un fallo no renueva el plazo (D-3b)
    });
    const firstAssertion = expect(first).rejects.toThrow('boom');
    const second = store.process(session.id, secondHandler); // llega vigente y espera su turno
    await flush();

    advance(2 * MIN); // t = T + 1 min: la sesión expira mientras el segundo espera
    gate.resolve();
    await firstAssertion;

    await expect(second).resolves.toEqual({ status: 'invalid' });
    expect(secondHandler).not.toHaveBeenCalled(); // no se procesa sobre el estado anterior
    expect(store.get(session.id)).toBeUndefined();
    expect(store.size).toBe(0);
  });
});
