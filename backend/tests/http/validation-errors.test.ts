import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { expectErrorResponse } from '../helpers/error-response';
import {
  buildTestRouter,
  SENSITIVE_ASYNC_MESSAGE,
  SENSITIVE_SYNC_MESSAGE,
  TEST_PREFIX,
  type HandlerCalls,
} from '../helpers/test-router';

// Pruebas de aceptación de TK-00.1 (middleware validate con Zod y manejador global de errores).
// Supertest sobre createApp({ testRouter }), sin listen ni BD.

let calls: HandlerCalls;

function buildApp(): Express {
  calls = { body: [], query: 0, params: 0 };
  return createApp({ testRouter: buildTestRouter(calls) });
}

function postJson(app: Express, url: string, raw: string) {
  return request(app).post(url).set('Content-Type', 'application/json').send(raw);
}

const STACK_LINE = /\bat .+:\d+:\d+/;

describe('TK-00.1 · validación y errores HTTP', () => {
  describe('QA-16: cuerpo que el parser JSON no acepta', () => {
    test('QA-16: JSON mal formado responde 400 MALFORMED_REQUEST sin ejecutar el handler', async () => {
      const app = buildApp();
      const res = await postJson(app, `${TEST_PREFIX}/body`, '{"a":');
      expectErrorResponse(res, 400, 'MALFORMED_REQUEST');
      expect(calls.body).toHaveLength(0);
    });

    test('QA-16 (A8): cuerpo JSON mayor que el límite del parser responde 400 MALFORMED_REQUEST', async () => {
      const app = buildApp();
      const big = JSON.stringify({ name: 'x'.repeat(1024 * 1024), qty: 1 }); // ~1 MB
      const res = await postJson(app, `${TEST_PREFIX}/body`, big);
      expectErrorResponse(res, 400, 'MALFORMED_REQUEST');
      expect(calls.body).toHaveLength(0);
    });
  });

  test('QA-17: JSON válido que no cumple el esquema responde 422 VALIDATION_ERROR solo con code y message', async () => {
    const app = buildApp();
    const res = await postJson(app, `${TEST_PREFIX}/body`, JSON.stringify({ name: '', qty: -1 }));
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expect(calls.body).toHaveLength(0);
  });

  test('QA-18: JSON válido que cumple llega al handler con los datos validados y responde 2xx', async () => {
    const app = buildApp();
    const res = await postJson(app, `${TEST_PREFIX}/body`, JSON.stringify({ name: 'guantes', qty: 2, extra: 'x' }));
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    // z.object descarta las claves desconocidas: el handler recibe la salida del esquema.
    expect(calls.body).toEqual([{ name: 'guantes', qty: 2 }]);
    expect(res.body).toEqual({ received: { name: 'guantes', qty: 2 } });
  });

  test('QA-18 (A7): query y params válidos llegan al handler y responden 2xx', async () => {
    const app = buildApp();
    const q = await request(app).get(`${TEST_PREFIX}/search`).query({ limit: '5' });
    const p = await request(app).get(`${TEST_PREFIX}/items/7`);
    expect(q.status).toBe(200);
    expect(p.status).toBe(200);
    expect(calls.query).toBe(1);
    expect(calls.params).toBe(1);
  });

  test('QA-19 (A7): query inválida responde 422 VALIDATION_ERROR sin ejecutar el handler', async () => {
    const app = buildApp();
    const res = await request(app).get(`${TEST_PREFIX}/search`).query({ limit: 'abc' });
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expect(calls.query).toBe(0);
  });

  test('QA-19 (A7): params de ruta inválidos responden 422 VALIDATION_ERROR sin ejecutar el handler', async () => {
    const app = buildApp();
    const res = await request(app).get(`${TEST_PREFIX}/items/abc`);
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expect(calls.params).toBe(0);
  });

  test.each([
    ['cadena', '"abc"'],
    ['número', '123'],
  ])('QA-20 (A8): JSON válido primitivo (%s) contra un esquema de objeto responde 422 VALIDATION_ERROR', async (_label, raw) => {
    const app = buildApp();
    const res = await postJson(app, `${TEST_PREFIX}/body`, raw);
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expect(calls.body).toHaveLength(0);
  });

  describe('QA-21/QA-22: errores no controlados', () => {
    let consoleError: jest.SpyInstance;
    beforeEach(() => {
      // El manejador puede registrar el error; se silencia para no ensuciar la salida.
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => consoleError.mockRestore());

    test.each([
      ['QA-21', 'síncrono', 'throw-sync', SENSITIVE_SYNC_MESSAGE],
      ['QA-22', 'asíncrono (promesa rechazada)', 'throw-async', SENSITIVE_ASYNC_MESSAGE],
    ])('%s: error %s responde 500 INTERNAL_ERROR con mensaje genérico, sin stack ni el mensaje original', async (_id, _label, route, sensitive) => {
      const app = buildApp();
      const res = await request(app).get(`${TEST_PREFIX}/${route}`);
      expectErrorResponse(res, 500, 'INTERNAL_ERROR');
      expect(res.text).not.toContain(sensitive);
      expect(res.text).not.toContain('QA2');
      expect(res.text).not.toMatch(STACK_LINE);
      expect(res.text).not.toContain('stack');
    });
  });
});
