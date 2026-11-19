import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../src/middlewares/validate';

// Router solo de pruebas (TK-00.1, "Diseño para pruebas"). Contrato de montaje asumido:
// createApp({ testRouter }) lo monta bajo /api/v1, después de las rutas propias y antes
// de los manejadores 404 y de errores; el parser JSON se aplica antes.
export const TEST_PREFIX = '/api/v1/__test';

export const SENSITIVE_SYNC_MESSAGE = 'QA21-MENSAJE-SENSIBLE-password=hunter2';
export const SENSITIVE_ASYNC_MESSAGE = 'QA22-MENSAJE-SENSIBLE-token=abc123';

export const bodySchema = z.object({
  name: z.string().min(1),
  qty: z.number().int().positive(),
});

export interface HandlerCalls {
  body: unknown[];
  query: number;
  params: number;
}

export function buildTestRouter(calls: HandlerCalls): Router {
  const router = Router();

  router.post('/__test/body', validate({ body: bodySchema }), (req, res) => {
    calls.body.push(req.body);
    res.status(200).json({ received: req.body });
  });

  router.get(
    '/__test/search',
    validate({ query: z.object({ limit: z.coerce.number().int().positive() }) }),
    (_req, res) => {
      calls.query += 1;
      res.status(200).json({ ok: true });
    },
  );

  router.get(
    '/__test/items/:id',
    validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
    (_req, res) => {
      calls.params += 1;
      res.status(200).json({ ok: true });
    },
  );

  router.get('/__test/throw-sync', () => {
    throw new Error(SENSITIVE_SYNC_MESSAGE);
  });

  router.get('/__test/throw-async', async () => {
    await Promise.resolve();
    throw new Error(SENSITIVE_ASYNC_MESSAGE);
  });

  return router;
}
