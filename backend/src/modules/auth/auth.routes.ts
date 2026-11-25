import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { createLoginController } from './auth.controller';
import type { AuthService } from './auth.service';

// LoginRequest del contrato: additionalProperties false, email con formato y máx. 254, password 1..200.
const loginBody = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export function createAuthRouter(service: AuthService): Router {
  const router = Router();
  router.post('/auth/login', validate({ body: loginBody }), createLoginController(service));
  return router;
}
