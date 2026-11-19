import request from 'supertest';
import { Router } from 'express';
import type { Express } from 'express';
import { z } from 'zod';
import { createApp } from '../../src/app';
import { validate } from '../../src/middlewares/validate';
import { expectErrorResponse } from '../helpers/error-response';

// Regresión de la observación O2 de QA en TK-00.1: un parámetro de ruta con codificación
// porcentual inválida no debe responder 500. El router de Express 5 (router 2.x, decodeParam)
// lanza un URIError con status 400 y el valor recibido en el mensaje.

const PREFIX = '/api/v1/__malformed';
const INTERNAL_SECRET = 'O2-MENSAJE-INTERNO-secret=xyz';
const STACK_LINE = /\bat .+:\d+:\d+/;

interface Calls {
  validated: string[];
  raw: string[];
}

let calls: Calls;

function buildApp(): Express {
  calls = { validated: [], raw: [] };
  const router = Router();

  router.get(
    '/__malformed/validated/:id',
    validate({ params: z.object({ id: z.string().min(1) }) }),
    (req, res) => {
      calls.validated.push(String(req.params.id));
      res.status(200).json({ id: req.params.id });
    },
  );

  router.get('/__malformed/raw/:id', (req, res) => {
    calls.raw.push(String(req.params.id));
    res.status(200).json({ id: req.params.id });
  });

  router.get('/__malformed/throw-plain', () => {
    throw new Error(INTERNAL_SECRET);
  });

  // URIError lanzado por código propio: no es el error de decodificación del router.
  router.get('/__malformed/throw-urierror', () => {
    decodeURIComponent('%E0');
  });

  // Errores con `status` propio que no son el de decodificación de parámetros.
  router.get('/__malformed/throw-status-400', () => {
    throw Object.assign(new Error(INTERNAL_SECRET), { status: 400, statusCode: 400 });
  });

  router.get('/__malformed/throw-status-403', () => {
    throw Object.assign(new Error(INTERNAL_SECRET), { status: 403, statusCode: 403, expose: true });
  });

  return createApp({ testRouter: router });
}

function expectNoLeak(text: string): void {
  expect(text).not.toMatch(STACK_LINE);
  expect(text).not.toContain('stack');
  expect(text).not.toContain(INTERNAL_SECRET);
  expect(text).not.toContain('O2-');
}

describe('TK-00.1 · O2: parámetros de ruta mal codificados', () => {
  test.each([
    ['con validate()', 'validated'],
    ['sin validate()', 'raw'],
  ])('parámetro %s con codificación inválida responde 422 VALIDATION_ERROR sin ejecutar el handler', async (_label, route) => {
    const app = buildApp();
    const res = await request(app).get(`${PREFIX}/${route}/%E0`);
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expect(calls.validated).toHaveLength(0);
    expect(calls.raw).toHaveLength(0);
  });

  test('el mensaje no repite el valor recibido ni el mensaje interno del router', async () => {
    const app = buildApp();
    const res = await request(app).get(`${PREFIX}/raw/zz%E0zz`);
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expect(res.text).not.toContain('%E0');
    expect(res.text).not.toContain('zz');
    expect(res.text).not.toContain('Failed to decode');
    expectNoLeak(res.text);
  });

  test('un parámetro bien codificado se decodifica y llega al handler', async () => {
    const app = buildApp();
    const res = await request(app).get(`${PREFIX}/validated/gasa%20est%C3%A9ril`);
    expect(res.status).toBe(200);
    expect(calls.validated).toEqual(['gasa estéril']);
  });

  test('una ruta inexistente con segmento mal codificado sigue respondiendo 404 NOT_FOUND', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/no-existe/%E0');
    expectErrorResponse(res, 404, 'NOT_FOUND');
  });

  describe('los demás errores conservan su tratamiento', () => {
    test.each([
      ['Error genérico', 'throw-plain'],
      ['URIError propio sin status', 'throw-urierror'],
      ['error con status 400 propio', 'throw-status-400'],
      ['error con status 403 propio', 'throw-status-403'],
    ])('%s responde 500 INTERNAL_ERROR genérico, sin stack ni mensaje interno', async (_label, route) => {
      const app = buildApp();
      const res = await request(app).get(`${PREFIX}/${route}`);
      expectErrorResponse(res, 500, 'INTERNAL_ERROR');
      expect(res.body.error.message).toBe('Ocurrió un error inesperado.');
      expect(res.text).not.toContain('URI');
      expectNoLeak(res.text);
    });
  });
});
