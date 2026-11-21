import { Router } from 'express';
import { createApp } from '../../src/app';
import { withRealServer, fireConcurrent } from '../helpers/concurrent-http';

// Pruebas de TK-00.5 · utilidad de peticiones HTTP simultáneas contra un http.Server real (A9).
// Solo demuestran la utilidad de pruebas; no prueban concurrencia de negocio ni RNF-04.

const BARRIER_TIMEOUT_MS = 1500;

/** Router con un endpoint de barrera: responde 200 solo cuando hay `n` peticiones en curso a la vez. */
function barrierRouter(n: number) {
  const state = { inFlight: 0, maxInFlight: 0, timedOut: 0 };
  const waiting: Array<() => void> = [];
  const router = Router();
  router.get('/__test/barrier', (_req, res) => {
    state.inFlight += 1;
    state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      state.inFlight -= 1;
      res.status(200).json({ released: true });
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      state.inFlight -= 1;
      state.timedOut += 1;
      res.status(504).json({ released: false });
    }, BARRIER_TIMEOUT_MS);
    waiting.push(() => {
      clearTimeout(timer);
      release();
    });
    if (waiting.length >= n) waiting.splice(0).forEach((fn) => fn());
  });
  return { router, state };
}

describe('TK-00.5 · utilidad HTTP concurrente', () => {
  test('QA-00.5-19 N peticiones simultáneas contra un servidor real: todas 200 y el servidor registra N a la vez', async () => {
    const N = 5;
    const { router, state } = barrierRouter(N);
    await withRealServer(createApp({ testRouter: router }), async (server) => {
      expect(server.address.address).toBe('127.0.0.1');
      expect(server.address.port).toBeGreaterThan(0);
      const responses = await fireConcurrent(server, N, '/api/v1/__test/barrier');
      expect(responses).toHaveLength(N);
      expect(responses.map((r) => r.status)).toEqual(Array(N).fill(200));
    });
    expect(state.maxInFlight).toBe(N);
    expect(state.timedOut).toBe(0);
  });

  test('QA-00.5-19 control negativo: con barrera N+1 la espera vence y la prueba lo detecta', async () => {
    const N = 4;
    const { router, state } = barrierRouter(N + 1);
    await withRealServer(createApp({ testRouter: router }), async (server) => {
      const responses = await fireConcurrent(server, N, '/api/v1/__test/barrier');
      expect(responses.map((r) => r.status)).toEqual(Array(N).fill(504));
    });
    expect(state.maxInFlight).toBe(N);
    expect(state.timedOut).toBe(N);
  });

  test('QA-00.5-20 N GET /api/v1/health simultáneos: N respuestas 200 { status: "ok" }; el puerto queda libre', async () => {
    const N = 10;
    let port = 0;
    await withRealServer(createApp(), async (server) => {
      port = server.address.port;
      const responses = await fireConcurrent(server, N, '/api/v1/health');
      expect(responses).toHaveLength(N);
      for (const r of responses) {
        expect(r.status).toBe(200);
        expect(JSON.parse(r.body)).toEqual({ status: 'ok' });
      }
    });
    await expect(fetch(`http://127.0.0.1:${port}/api/v1/health`)).rejects.toThrow();
  });
});
