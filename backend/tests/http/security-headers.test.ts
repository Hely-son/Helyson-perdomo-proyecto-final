import request from 'supertest';
import { createApp } from '../../src/app';

// Regresión del hallazgo SEC-01 de TK-00.1: Express no debe anunciarse con X-Powered-By.
// Supertest sobre createApp(), sin listen ni BD.

describe('TK-00.1 · SEC-01 · sin cabecera X-Powered-By', () => {
  test('SEC-01: GET /api/v1/health (200) no envía X-Powered-By', async () => {
    const res = await request(createApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('SEC-01: GET de ruta inexistente (404) no envía X-Powered-By', async () => {
    const res = await request(createApp()).get('/api/v1/no-existe');
    expect(res.status).toBe(404);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
