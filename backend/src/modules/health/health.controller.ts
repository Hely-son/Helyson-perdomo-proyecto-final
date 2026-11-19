import type { Request, Response } from 'express';

// GET /api/v1/health: comprobación técnica (esquema Health del contrato). Sin reglas, sin servicio.
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok' });
}
