import { ChatSessionStore } from '../../../src/modules/chat/session-store';

// TK-05.2 · Pruebas de aceptación de QA (fase 1): decisión D-3 de la puerta 1 (2026-11-26), hallazgo bajo de TK-05.7 (QA fase 2).
// Contrato de concurrencia que se prueba, solo con el comportamiento público de ChatSessionStore (create, process, get, size,
// startSweep, stopSweep) y reloj controlado (fake timers de Jest; sin red ni base de datos):
//  a. un contador por sesión se incrementa de forma SÍNCRONA al aceptar el mensaje en process() (antes de cualquier await) y se
//     libera en `finally`; cubre los mensajes en cola y el que se procesa;
//  b. la expiración se comprueba al recibir el mensaje (expirada: invalid, sin incrementar el contador ni bloquear el barrido) y,
//     como en TK-05.7 (D-3a), otra vez al llegar el turno; no entran en conflicto con las pruebas de session-store.test.ts;
//  c. el orden de llegada dentro de una sesión se conserva;
//  d. el barrido omite las sesiones con contador > 0 (pendiente o en procesamiento);
//  e. al terminar, el plazo queda renovado (DP-06);
//  f. si el manejador lanza, el contador se libera, el siguiente mensaje en cola se procesa y la sesión sin mensajes y expirada
//     vuelve a ser eliminable por el barrido;
//  g. una sesión sin mensajes y expirada se elimina en el barrido.
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

describe('TK-05.2 · D-3 · el barrido no elimina sesiones con mensajes pendientes o en procesamiento', () => {
  test('D-3 (a, d) · el contador se incrementa al aceptar el mensaje, sin esperar a que arranque el manejador: un barrido síncrono tras process() no elimina la sesión; en su turno el mensaje comprueba la expiración (D-3a) y no se procesa', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: ['A'] });
    store.startSweep();
    advance(29 * MIN);
    const handler = jest.fn();

    const pending = store.process(session.id, handler); // aceptado vigente; sin await ni flush
    advance(2 * MIN); // barridos de los minutos 30 y 31, antes de que corra ninguna microtarea
    expect(store.size).toBe(1); // el barrido respetó el mensaje pendiente

    await expect(pending).resolves.toEqual({ status: 'invalid' }); // al llegar el turno, por reloj, ya expiró
    expect(handler).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  test('D-3 (d, e) · un mensaje en procesamiento y otro en cola detrás, con el barrido corriendo sobre una sesión expirada por reloj: no se pierde; ambos se procesan y el plazo queda renovado', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: ['A'] });
    store.startSweep();
    advance(29 * MIN);
    const gate = deferred();
    const order: string[] = [];

    const first = store.process(session.id, async () => {
      order.push('first:start');
      await gate.promise;
      order.push('first:end');
    });
    const second = store.process(session.id, async () => {
      order.push('second');
    });
    await flush();
    expect(order).toEqual(['first:start']);

    advance(1 * MIN); // t = 30 min (aún vigente)
    advance(1 * MIN); // t = 31 min: expirada por reloj; el barrido corre con uno en proceso y otro pendiente
    expect(store.size).toBe(1);
    advance(1 * MIN); // t = 32 min: otro barrido
    expect(store.size).toBe(1);

    gate.resolve();
    await expect(first).resolves.toEqual({ status: 'processed', result: undefined });
    await expect(second).resolves.toEqual({ status: 'processed', result: undefined });
    expect(order).toEqual(['first:start', 'first:end', 'second']);
    expect(store.get(session.id)).toBe(session);
    expect(session.cart).toEqual(['A']);
    expect(session.lastProcessedAt).toBe(T0.getTime() + 32 * MIN); // renovada al terminar (DP-06)
  });

  test('D-3 (e) · un solo mensaje lento: al terminar, el plazo queda renovado y la sesión vive otros TTL; después el contador está liberado y el barrido la elimina', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    store.startSweep();
    advance(29 * MIN);
    const gate = deferred();
    const processing = store.process(session.id, async () => {
      await gate.promise;
    });
    await flush();
    advance(2 * MIN); // t = 31 min
    expect(store.size).toBe(1);
    gate.resolve();
    await processing;
    expect(session.lastProcessedAt).toBe(T0.getTime() + 31 * MIN);

    advance(30 * MIN); // t = 61 min: 30 min desde la renovación, aún vigente
    expect(store.size).toBe(1);
    advance(2 * MIN); // t = 63 min: pasó el TTL sin actividad y ya no hay mensajes: eliminable
    expect(store.size).toBe(0);
  });

  test('D-3 (c) · el orden de llegada se conserva dentro de la sesión aunque los manejadores terminen al revés y el barrido corra', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    store.startSweep();
    advance(29 * MIN);
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
    advance(2 * MIN);
    expect(store.size).toBe(1);

    gates[2].resolve();
    gates[1].resolve();
    gates[0].resolve();
    await expect(Promise.all(results)).resolves.toEqual([
      { status: 'processed', result: 0 },
      { status: 'processed', result: 1 },
      { status: 'processed', result: 2 },
    ]);
    expect(log).toEqual(['start0', 'end0', 'start1', 'end1', 'start2', 'end2']);
  });

  test('D-3 (d) · el contador es por sesión: con una sesión ocupada, el barrido sigue eliminando otras sesiones expiradas', async () => {
    const store = makeStore(30);
    const busy = store.create({ customerId: 1, state: 'MAIN_MENU', cart: ['A'] });
    const idle = store.create({ customerId: 2, state: 'MAIN_MENU', cart: ['B'] });
    store.startSweep();
    advance(29 * MIN);
    const gate = deferred();
    const processing = store.process(busy.id, async () => {
      await gate.promise;
    });
    await flush();
    advance(2 * MIN); // t = 31 min

    expect(store.size).toBe(1); // `idle` eliminada, `busy` conservada
    gate.resolve();
    await processing;
    expect(store.get(busy.id)).toBe(busy);
    expect(store.get(idle.id)).toBeUndefined();
  });
});

describe('TK-05.2 · D-3 · expiración al recibir el mensaje', () => {
  test('D-3 (b) · una sesión ya expirada al llamar a process() responde invalid, no invoca el manejador y no queda protegida: el barrido siguiente la elimina', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: ['A'] });
    store.startSweep();
    advance(30 * MIN + 30_000); // t = 30 min 30 s: expirada; los barridos hasta el minuto 30 no la tocaron (inactividad = TTL)
    const handler = jest.fn();

    const result = store.process(session.id, handler);
    advance(30_000); // barrido del minuto 31, antes de que corra ninguna microtarea
    expect(store.size).toBe(0); // el mensaje rechazado no bloqueó su eliminación

    await expect(result).resolves.toEqual({ status: 'invalid' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('TK-05.2 · D-3 · errores del manejador', () => {
  test('D-3 (f) · si el primer manejador lanza, el contador se libera, el siguiente mensaje en cola se procesa y, ya sin mensajes y pasado el TTL, el barrido elimina la sesión', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    store.startSweep();
    advance(10 * MIN);
    const gate = deferred();

    const first = store.process(session.id, async () => {
      await gate.promise;
    });
    const firstRejected = expect(first).rejects.toThrow('fallo del manejador');
    const second = store.process(session.id, async () => 'second');
    await flush();
    gate.reject(new Error('fallo del manejador'));
    await firstRejected;
    await expect(second).resolves.toEqual({ status: 'processed', result: 'second' });
    expect(session.lastProcessedAt).toBe(T0.getTime() + 10 * MIN); // el éxito del segundo renueva; el fallo del primero no

    advance(31 * MIN); // t = 41 min: 31 min sin actividad
    expect(store.size).toBe(0);
  });

  test('D-3 (f) · si el único manejador lanza, el plazo no se renueva y la marca no queda colgada: el barrido posterior elimina la sesión', async () => {
    const store = makeStore(30);
    const session = store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    store.startSweep();
    advance(10 * MIN);
    const gate = deferred();
    const processing = store.process(session.id, async () => {
      await gate.promise;
    });
    const settled = expect(processing).rejects.toThrow('fallo del manejador');
    await flush();
    gate.reject(new Error('fallo del manejador'));
    await settled;
    expect(session.lastProcessedAt).toBe(T0.getTime());

    advance(25 * MIN); // t = 35 min
    expect(store.size).toBe(0);
  });
});

describe('TK-05.2 · D-3 · sesión sin mensajes', () => {
  test('D-3 (g) · una sesión expirada sin mensajes en curso se elimina en el barrido (comportamiento de TK-05.7 intacto)', () => {
    const store = makeStore(30);
    store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
    store.startSweep();
    advance(31 * MIN);
    expect(store.size).toBe(0);
  });
});
