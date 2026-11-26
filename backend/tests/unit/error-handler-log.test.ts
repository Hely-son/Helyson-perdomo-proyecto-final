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

  // TK-05.1 · D-B: el sessionId es una credencial. El registro enmascara los segmentos con forma de UUID en la ruta
  // (placeholder `:id`); el resto de la ruta no cambia. Interfaz asumida: el registro sigue siendo `Nombre MÉTODO ruta\n`.
  test('TK-05.1 D-B · un segmento UUID de la ruta se registra como :id y el UUID no aparece en stderr', async () => {
    const router = Router();
    router.post('/__t/chat/sessions/:id/messages', () => {
      throw new TypeError('MENSAJE-SECRETO');
    });
    const app = createTestApp({ testRouter: router });
    const uuid = '3f1c2a9e-8b7d-4c1e-9f0a-2b6d5e4c3a21';
    const out = captureOutput();
    try {
      const res = await request(app).post(`/api/v1/__t/chat/sessions/${uuid}/messages?x=1`).send({});
      expect(res.status).toBe(500);
      expect(out.stderr()).toBe('TypeError POST /api/v1/__t/chat/sessions/:id/messages\n');
      expect(out.all()).not.toContain(uuid);
    } finally {
      out.restore();
    }
  });

  test('TK-05.1 D-B · el enmascarado no distingue mayúsculas y minúsculas en el UUID', async () => {
    const router = Router();
    router.post('/__t/chat/sessions/:id/messages', () => {
      throw new TypeError('x');
    });
    const app = createTestApp({ testRouter: router });
    const uuid = '3F1C2A9E-8B7D-4C1E-9F0A-2B6D5E4C3A21';
    const out = captureOutput();
    try {
      await request(app).post(`/api/v1/__t/chat/sessions/${uuid}/messages`).send({});
      expect(out.stderr()).toBe('TypeError POST /api/v1/__t/chat/sessions/:id/messages\n');
      expect(out.all().toLowerCase()).not.toContain(uuid.toLowerCase());
    } finally {
      out.restore();
    }
  });

  test('TK-05.1 D-B · un segmento que no es UUID (identificador numérico o texto) se registra sin cambios', async () => {
    const router = Router();
    router.get('/__t/items/:id', () => {
      throw new TypeError('x');
    });
    const app = createTestApp({ testRouter: router });
    const out = captureOutput();
    try {
      await request(app).get('/api/v1/__t/items/42');
      await request(app).get('/api/v1/__t/items/abc-123');
      expect(out.stderr()).toBe('TypeError GET /api/v1/__t/items/42\n\nTypeError GET /api/v1/__t/items/abc-123\n');
    } finally {
      out.restore();
    }
  });
});
