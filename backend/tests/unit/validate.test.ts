import { Router } from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../../src/app';
import { validate } from '../../src/middlewares/validate';

// Pruebas propias del Backend Engineer (TK-00.1, condición 4): los handlers reciben en
// body, query y params la salida del esquema Zod (valores transformados), no la entrada cruda.

function buildApp(seen: unknown[]) {
  const router = Router();
  router.get(
    '/__unit/items/:id',
    validate({
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({ limit: z.coerce.number().int().positive(), tag: z.string().optional() }),
    }),
    (req, res) => {
      seen.push({ params: req.params, query: req.query });
      res.status(200).json({ ok: true });
    },
  );
  router.post(
    '/__unit/upper',
    validate({ body: z.object({ name: z.string().transform((s) => s.toUpperCase()) }) }),
    (req, res) => {
      seen.push({ body: req.body });
      res.status(200).json({ ok: true });
    },
  );
  return createApp({ testRouter: router });
}

describe('TK-00.1 · validate() entrega los datos validados', () => {
  test('query y params llegan coercionados y sin claves desconocidas', async () => {
    const seen: unknown[] = [];
    const res = await request(buildApp(seen)).get('/api/v1/__unit/items/7').query({ limit: '5', extra: 'x' });
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ params: { id: 7 }, query: { limit: 5 } }]);
  });

  test('body llega con las transformaciones del esquema aplicadas', async () => {
    const seen: unknown[] = [];
    const res = await request(buildApp(seen)).post('/api/v1/__unit/upper').send({ name: 'guantes' });
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ body: { name: 'GUANTES' } }]);
  });

  test('el 422 no refleja los valores recibidos', async () => {
    const seen: unknown[] = [];
    const res = await request(buildApp(seen)).get('/api/v1/__unit/items/7').query({ limit: 'MARCA-UNIT-422' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.text).not.toContain('MARCA-UNIT-422');
    expect(seen).toHaveLength(0);
  });
});
