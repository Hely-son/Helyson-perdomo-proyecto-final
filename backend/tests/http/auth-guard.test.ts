import request, { type Response } from 'supertest';
import { Router, type Express } from 'express';
import { createApp } from '../../src/app';
import { createPrismaClient } from '../../src/lib/prisma';
import { captureOutput } from '../helpers/capture-output';
import { expectErrorResponse } from '../helpers/error-response';
import { nowSeconds, QA_JWT_SECRET, QA_OTHER_SECRET, signTestJwt, validTestToken } from '../helpers/jwt';

// Pruebas de aceptación de TK-01.1 (middleware Bearer JWT y registro de errores 500), sin base de datos.
// Spec 05 §15.4, §15.5; ESC-27, ESC-28 (a), ESC-29 (PARCIAL), ESC-30; decisiones D1, D2, D4 de la puerta 1.
// Escenarios: docs/qa/TK-01.1-matrix.md.
//
// Interfaz asumida: createApp({ auth: { jwtSecret, jwtExpiresIn }, prisma, testRouter? }). El middleware Bearer
// se monta en los prefijos /api/v1/products y /api/v1/orders ANTES que testRouter, así que las rutas de sonda
// que testRouter declara bajo esos prefijos quedan protegidas. El middleware no consulta la base (JWT stateless):
// el cliente de Prisma apunta a un servidor inexistente y falla si se usa.

const PROTECTED = ['/api/v1/products', '/api/v1/products/alerts', '/api/v1/orders'] as const;
const PROBES = ['/api/v1/products/__qa-probe', '/api/v1/orders/__qa-probe'] as const;
const STACK_LINE = /\bat .+:\d+:\d+/;

const prisma = createPrismaClient('postgresql://qa_sin_bd:qa_sin_bd@127.0.0.1:9/qa_sin_bd');
afterAll(async () => {
  await prisma.$disconnect();
});

// ---- sonda bajo los prefijos protegidos (efectos observables) y rutas que fuerzan un 500 (D4a) ----

class QaSensitiveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'QaSensitiveError';
  }
}

const D4A = {
  message: 'QA-D4A-MENSAJE-SENSIBLE password=ficticia',
  cause: 'QA-D4A-CAUSA-SENSIBLE',
  query: 'QA-D4A-QUERY-SENSIBLE',
  prismaMessage: 'QA-D4A-PRISMA-MENSAJE relation "users" password_hash',
  prismaMeta: 'QA-D4A-PRISMA-META',
};

let probeCalls: number;

function buildRouter(): Router {
  const router = Router();
  for (const prefix of ['/products', '/orders']) {
    router.all(`${prefix}/__qa-probe`, (_req, res) => {
      probeCalls += 1;
      res.status(200).json({ probe: 'ok' });
    });
  }
  router.get('/__qa/fail-sync', () => {
    throw new QaSensitiveError(D4A.message, { cause: new Error(D4A.cause) });
  });
  router.get('/__qa/fail-async', async () => {
    await Promise.resolve();
    // Forma de un error de Prisma: nombre, código, meta y mensaje con detalles de la base.
    throw Object.assign(new Error(D4A.prismaMessage), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'], detail: D4A.prismaMeta },
    });
  });
  return router;
}

function buildApp(): Express {
  probeCalls = 0;
  return createApp({ auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' }, prisma, testRouter: buildRouter() });
}

function expectUnauthorized(res: Response): void {
  expectErrorResponse(res, 401, 'UNAUTHORIZED');
}

// ---- ESC-27 · sin token, token inválido (firma o formato) ----

describe('TK-01.1 · ESC-27 operación protegida sin token o con token inválido → 401 UNAUTHORIZED, sin efectos', () => {
  test.each(PROTECTED)('ESC-27 GET %s sin Authorization → 401 UNAUTHORIZED', async (url) => {
    const res = await request(buildApp()).get(url);
    expectUnauthorized(res);
  });

  test.each([
    ['GET', '/api/v1/products/1'],
    ['PATCH', '/api/v1/products/1'],
    ['POST', '/api/v1/products'],
    ['POST', '/api/v1/products/1/deactivate'],
    ['POST', '/api/v1/products/1/stock'],
    ['GET', '/api/v1/orders/1'],
    ['PATCH', '/api/v1/orders/1/status'],
  ] as const)('ESC-27 (D2) %s %s sin Authorization → 401 UNAUTHORIZED (prefijo protegido, también subrutas)', async (method, url) => {
    const agent = request(buildApp());
    const req = method === 'GET' ? agent.get(url) : method === 'POST' ? agent.post(url) : agent.patch(url);
    const res = await req.set('Content-Type', 'application/json').send('{}');
    expectUnauthorized(res);
  });

  const now = nowSeconds();
  const valid = validTestToken('1');
  const [vHead, vBody] = valid.split('.');
  const tamperedBody = Buffer.from(JSON.stringify({ sub: '2', iat: now, exp: now + 3600 })).toString('base64url');

  const invalidHeaders: [string, string][] = [
    ['firma con otro secreto', `Bearer ${validTestToken('1', QA_OTHER_SECRET)}`],
    ['payload manipulado (firma original)', `Bearer ${vHead}.${tamperedBody}.${valid.split('.')[2]}`],
    ['firma eliminada', `Bearer ${vHead}.${vBody}.`],
    ['alg none', `Bearer ${signTestJwt({ sub: '1', iat: now, exp: now + 3600 }, { alg: 'none' })}`],
    ['alg HS512 firmado con el secreto correcto (D1: solo HS256)', `Bearer ${signTestJwt({ sub: '1', iat: now, exp: now + 3600 }, { alg: 'HS512' })}`],
    ['formato: no es un JWT', 'Bearer no-es-un-jwt'],
    ['formato: dos partes', 'Bearer abc.def'],
    ['formato: partes no decodificables', 'Bearer %%%.%%%.%%%'],
    ['formato: Bearer sin token', 'Bearer '],
    ['formato: solo el token, sin esquema', valid],
    ['esquema distinto: Basic', `Basic ${Buffer.from('qa:qa').toString('base64')}`],
    ['esquema distinto: Token con un JWT válido', `Token ${valid}`],
  ];

  test.each(invalidHeaders)('ESC-27 GET /api/v1/products con Authorization inválido (%s) → 401 UNAUTHORIZED', async (_label, header) => {
    const res = await request(buildApp()).get('/api/v1/products').set('Authorization', header);
    expectUnauthorized(res);
  });

  test.each(PROBES)('ESC-27 sin efectos: la sonda %s no se ejecuta sin token ni con token inválido', async (url) => {
    const app = buildApp();
    for (const [, header] of [['sin token', ''] as [string, string], ...invalidHeaders]) {
      const req = request(app).post(url).set('Content-Type', 'application/json');
      if (header !== '') req.set('Authorization', header);
      expectUnauthorized(await req.send('{}'));
    }
    expect(probeCalls).toBe(0);
  });
});

// ---- ESC-28 (a) · token expirado firmado en el test ----

describe('TK-01.1 · ESC-28 (a) token expirado → 401 UNAUTHORIZED', () => {
  test('ESC-28 (a) token HS256 con la firma correcta y exp vencido → 401 UNAUTHORIZED y la sonda no se ejecuta', async () => {
    const now = nowSeconds();
    const expired = signTestJwt({ sub: '1', iat: now - 7200, exp: now - 60 });
    const app = buildApp();
    expectUnauthorized(await request(app).get('/api/v1/products').set('Authorization', `Bearer ${expired}`));
    expectUnauthorized(await request(app).get(PROBES[0]).set('Authorization', `Bearer ${expired}`));
    expect(probeCalls).toBe(0);
  });
});

// ---- ESC-29 (PARCIAL) · token válido atraviesa el middleware ----

describe('TK-01.1 · ESC-29 (PARCIAL hasta TK-03.1, TK-04.1 y TK-06.2) token válido', () => {
  test.each(PROTECTED)('ESC-29 parcial: GET %s con token válido no responde 401 UNAUTHORIZED', async (url) => {
    const res = await request(buildApp()).get(url).set('Authorization', `Bearer ${validTestToken('1')}`);
    expect(res.status).not.toBe(401);
    expect(res.body?.error?.code).not.toBe('UNAUTHORIZED');
  });

  test.each(PROBES)('ESC-29 parcial: con token válido la sonda %s se ejecuta (200)', async (url) => {
    const app = buildApp();
    const res = await request(app).get(url).set('Authorization', `Bearer ${validTestToken('1')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ probe: 'ok' });
    expect(probeCalls).toBe(1);
  });

  test.each(['/api/v1/products/1/__qa-no-existe', '/api/v1/orders/1/__qa-no-existe'])(
    'D2: con token válido, %s (ruta inexistente bajo prefijo protegido) → 404 NOT_FOUND',
    async (url) => {
      const res = await request(buildApp()).get(url).set('Authorization', `Bearer ${validTestToken('1')}`);
      expectErrorResponse(res, 404, 'NOT_FOUND');
    },
  );

  test('D2: sin token, una ruta inexistente bajo prefijo protegido → 401 UNAUTHORIZED (no revela 404)', async () => {
    const res = await request(buildApp()).get('/api/v1/orders/1/__qa-no-existe');
    expectUnauthorized(res);
  });
});

// ---- ESC-30 · operaciones públicas ----

describe('TK-01.1 · ESC-30 getHealth, login y startChatSession son públicas', () => {
  test.each([
    ['sin Authorization', undefined],
    ['con Authorization inválido', 'Bearer no-es-un-jwt'],
  ])('ESC-30 GET /api/v1/health %s → 200 { status: "ok" }', async (_label, header) => {
    const req = request(buildApp()).get('/api/v1/health');
    if (header) req.set('Authorization', header);
    const res = await req;
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test.each([
    ['POST /api/v1/auth/login', '/api/v1/auth/login', undefined],
    ['POST /api/v1/auth/login con Authorization inválido', '/api/v1/auth/login', 'Bearer no-es-un-jwt'],
    ['POST /api/v1/chat/sessions', '/api/v1/chat/sessions', undefined],
    ['POST /api/v1/chat/sessions con Authorization inválido', '/api/v1/chat/sessions', 'Bearer no-es-un-jwt'],
    [
      'POST /api/v1/chat/sessions/{id}/messages',
      '/api/v1/chat/sessions/6f1c2b4e-7a1d-4c3e-9b8a-0d2e4f6a8b1c/messages',
      undefined,
    ],
  ])('ESC-30 %s sin token válido no responde 401 UNAUTHORIZED', async (_label, url, header) => {
    // Cuerpo `{}`: no llega a la base (login responde 422 por esquema; chat aún no existe y responde 404).
    const req = request(buildApp()).post(url).set('Content-Type', 'application/json');
    if (header) req.set('Authorization', header);
    const res = await req.send('{}');
    expect(res.status).not.toBe(401);
    expect(res.body?.error?.code).not.toBe('UNAUTHORIZED');
  });

  test('ESC-30 POST /api/v1/auth/login con cuerpo {} → 422 VALIDATION_ERROR (la ruta existe y es pública)', async () => {
    const res = await request(buildApp()).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{}');
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
  });
});

// ---- D4a · registro mínimo de errores 500 ----

describe('TK-01.1 · D4a error no controlado: stderr solo con nombre del error y método + ruta', () => {
  test.each([
    ['síncrono', '/api/v1/__qa/fail-sync', 'QaSensitiveError'],
    ['asíncrono con forma de error de Prisma', '/api/v1/__qa/fail-async', 'PrismaClientKnownRequestError'],
  ])('D4a error %s → 500 INTERNAL_ERROR sin cambios; stderr con nombre y ruta, sin message, stack, cause, query ni detalles', async (_label, path, name) => {
    const output = captureOutput();
    let res!: Response;
    try {
      res = await request(buildApp()).get(`${path}?token=${D4A.query}&q=1`);
    } finally {
      output.restore();
    }
    // Respuesta HTTP sin cambios respecto de TK-00.1.
    expectErrorResponse(res, 500, 'INTERNAL_ERROR');
    expect(res.body.error.message).toBe('Ocurrió un error inesperado.');
    expect(res.text).not.toContain('QA-D4A');

    const stderr = output.stderr();
    expect(stderr).toContain(name);
    expect(stderr).toContain('GET');
    expect(stderr).toContain(path);

    const all = output.all();
    for (const secret of Object.values(D4A)) expect(all).not.toContain(secret);
    expect(all).not.toContain('QA-D4A');
    expect(all).not.toContain('?token=');
    expect(all).not.toContain('P2002');
    expect(all).not.toMatch(STACK_LINE);
  });
});
