import request from 'supertest';
import { createTestApp } from '../helpers/app';
import { captureOutput } from '../helpers/capture-output';
import { Router } from 'express';
import { AppError } from '../../src/lib/app-error';

// TK-01.1 · D4: el 500 escribe en stderr solo nombre del error, método y ruta (sin query); un AppError no escribe.

describe('TK-01.1 · registro mínimo de errores 500', () => {
  test('stderr tiene una línea con nombre, método y ruta; nada más', async () => {
    const router = Router();
    router.get('/__t/boom', () => {
      throw new TypeError('MENSAJE-SECRETO');
    });
    router.get('/__t/app-error', () => {
      throw new AppError(409, 'STOCK_CHANGED', 'x');
    });
    const app = createTestApp({ testRouter: router });
    const out = captureOutput();
    try {
      await request(app).get('/api/v1/__t/boom?token=SECRETO');
      expect(out.stderr()).toBe('TypeError GET /api/v1/__t/boom\n');
      await request(app).get('/api/v1/__t/app-error');
      expect(out.stderr()).toBe('TypeError GET /api/v1/__t/boom\n');
    } finally {
      out.restore();
    }
  });
});
