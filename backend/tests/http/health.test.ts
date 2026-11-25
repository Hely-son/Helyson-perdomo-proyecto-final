import request from 'supertest';
import { createTestApp } from '../helpers/app';
import { expectErrorResponse } from '../helpers/error-response';

// Pruebas de aceptación de TK-00.1 (health y 404). Supertest sobre createTestApp(), sin listen ni BD.

describe('TK-00.1 · GET /api/v1/health y rutas inexistentes', () => {
  test('QA-13: GET /api/v1/health sin Authorization responde 200 con exactamente { "status": "ok" }', async () => {
    const res = await request(createTestApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toEqual({ status: 'ok' });
    expect(Object.keys(res.body)).toEqual(['status']);
  });

  test.each(['/api/v1/no-existe', '/', '/health'])('QA-14: GET %s responde 404 NOT_FOUND', async (url) => {
    const res = await request(createTestApp()).get(url);
    expectErrorResponse(res, 404, 'NOT_FOUND');
  });

  test('QA-15 (A6): POST /api/v1/health responde 404 NOT_FOUND', async () => {
    const res = await request(createTestApp()).post('/api/v1/health').set('Content-Type', 'application/json').send('{}');
    expectErrorResponse(res, 404, 'NOT_FOUND');
  });
});
