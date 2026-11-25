import type { RequestHandler } from 'express';
import type { AuthService, LoginInput } from './auth.service';

export function createLoginController(service: AuthService): RequestHandler {
  return async (req, res) => {
    res.status(200).json(await service.login(req.body as LoginInput));
  };
}
