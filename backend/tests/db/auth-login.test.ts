import bcrypt from 'bcryptjs';
import request, { type Response } from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config/env';
import { createPrismaClient } from '../../src/lib/prisma';
import { BCRYPT_COST } from '../../src/modules/auth/password';
import { runSeed } from '../../src/seed/seed';
import { captureOutput } from '../helpers/capture-output';
import { expectErrorResponse } from '../helpers/error-response';
import { decodeJwt, nowSeconds, QA_JWT_SECRET, verifiesWith } from '../helpers/jwt';
import { deriveTestDatabaseUrl, TEST_DATABASE_NAME } from './helpers/test-database';

// Pruebas de aceptación de TK-01.1 · POST /api/v1/auth/login contra PostgreSQL real (medsupply_test).
// Spec 05 §15.2–§15.4; ESC-23, ESC-24, ESC-25, ESC-26, ESC-28 (b), ESC-31, ESC-51; contrato LoginRequest/LoginResponse
// (RNF-02); decisiones D1 y D3 de la puerta 1. Escenarios: docs/qa/TK-01.1-matrix.md.
// La limpieza global vacía la base antes de cada test; el operador se crea con el seed (runSeed) en cada uno.
// Credenciales y secretos ficticios. Ningún test imprime tokens ni contraseñas.

type Db = ReturnType<typeof createPrismaClient>;
let db: Db;

const OPERATOR = { email: 'operador.qa@example.test', password: 'Login-Pass-Ficticia-QA-7781', name: 'Operador QA Login' };
const WRONG_PASSWORD = 'Otra-Pass-Ficticia-QA-0000';
const UNKNOWN_EMAIL = 'nadie.qa@example.test';
const EMPTY_FIXTURES = { customers: [], products: [], orders: [] };
const LOGIN = '/api/v1/auth/login';
const EIGHT_HOURS_S = 8 * 60 * 60;

beforeAll(async () => {
  db = createPrismaClient(deriveTestDatabaseUrl());
  const rows = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (rows[0]?.name !== TEST_DATABASE_NAME) {
    await db.$disconnect();
    throw new Error(`Operación abortada: la base conectada no es ${TEST_DATABASE_NAME}`);
  }
});
afterAll(async () => {
  await db?.$disconnect();
});

/** Operador del seed (TK-00.4) en la base vacía. Devuelve la fila guardada. */
async function seedOperator() {
  await runSeed(db, OPERATOR, EMPTY_FIXTURES, () => undefined);
  return db.user.findUniqueOrThrow({ where: { email: OPERATOR.email } });
}

function buildApp(jwtExpiresIn = '8h'): Express {
  return createApp({ auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn }, prisma: db });
}

function login(app: Express, body: unknown): Promise<Response> {
  return request(app).post(LOGIN).set('Content-Type', 'application/json').send(JSON.stringify(body));
}

function postRaw(app: Express, raw: string): Promise<Response> {
  return request(app).post(LOGIN).set('Content-Type', 'application/json').send(raw);
}

/** Cuerpo exacto de LoginResponse (additionalProperties: false) y de Operator. */
function expectLoginResponse(res: Response, operator: { id: number; email: string; name: string }): void {
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(Object.keys(res.body).sort()).toEqual(['expiresAt', 'operator', 'token', 'tokenType']);
  expect(res.body.tokenType).toBe('Bearer');
  expect(typeof res.body.token).toBe('string');
  expect(res.body.token.split('.')).toHaveLength(3);
  expect(typeof res.body.expiresAt).toBe('string');
  expect(res.body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  expect(Number.isNaN(Date.parse(res.body.expiresAt))).toBe(false);
  expect(res.body.operator).toEqual({ id: operator.id, email: operator.email, name: operator.name });
  expect(Object.keys(res.body.operator).sort()).toEqual(['email', 'id', 'name']);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TK-01.1 · POST /api/v1/auth/login contra medsupply_test', () => {
  test('ESC-23 login válido del operador del seed → 200 LoginResponse (token HS256, Bearer, expiresAt, operador) sin contraseña ni hash', async () => {
    const user = await seedOperator();
    const app = buildApp();
    const before = nowSeconds();
    const res = await login(app, { email: OPERATOR.email, password: OPERATOR.password });
    const after = nowSeconds();

    expectLoginResponse(res, user);
    expect(res.text).not.toContain(OPERATOR.password);
    expect(res.text).not.toContain(user.passwordHash);
    expect(res.text).not.toMatch(/password/i);

    // D1: HS256 firmado con el secreto configurado, payload mínimo (sub, iat, exp), expiresAt derivado de exp.
    const { header, payload } = decodeJwt(res.body.token);
    expect(header.alg).toBe('HS256');
    expect(verifiesWith(res.body.token, QA_JWT_SECRET)).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(String(payload.sub)).toBe(String(user.id));
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    expect(new Date(res.body.expiresAt).getTime()).toBe((payload.exp as number) * 1000);

    // El token emitido atraviesa el middleware Bearer (ESC-29 parcial: aún no hay endpoint, D2 → no 401).
    const protectedRes = await request(app).get('/api/v1/products').set('Authorization', `Bearer ${res.body.token}`);
    expect(protectedRes.status).not.toBe(401);
  });

  test.each(['OPERADOR.QA@EXAMPLE.TEST', 'Operador.Qa@Example.Test'])(
    'ESC-24 login con el email en mayúsculas (%s) → 200; el email se compara en minúsculas',
    async (email) => {
      const user = await seedOperator();
      const res = await login(buildApp(), { email, password: OPERATOR.password });
      expectLoginResponse(res, user);
      expect(res.body.operator.email).toBe(OPERATOR.email);
    },
  );

  test('ESC-25 contraseña incorrecta y email inexistente → 401 INVALID_CREDENTIALS con el mismo cuerpo (code y message), sin token', async () => {
    await seedOperator();
    const app = buildApp();
    const wrongPassword = await login(app, { email: OPERATOR.email, password: WRONG_PASSWORD });
    const unknownEmail = await login(app, { email: UNKNOWN_EMAIL, password: OPERATOR.password });

    expectErrorResponse(wrongPassword, 401, 'INVALID_CREDENTIALS');
    expectErrorResponse(unknownEmail, 401, 'INVALID_CREDENTIALS');
    // RNF-08 / D3: mensaje genérico idéntico; no indica qué dato falló.
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(unknownEmail.headers['content-type']).toBe(wrongPassword.headers['content-type']);
  });

  describe('ESC-26 cuerpo fuera de esquema o que no es JSON → sin token', () => {
    test.each([
      ['sin email', { password: OPERATOR.password }],
      ['sin contraseña', { email: OPERATOR.email }],
      ['contraseña vacía', { email: OPERATOR.email, password: '' }],
      ['email sin formato', { email: 'no-es-un-email', password: OPERATOR.password }],
    ])('ESC-26 %s → 422 VALIDATION_ERROR', async (_label, body) => {
      await seedOperator();
      const res = await login(buildApp(), body);
      expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    });

    test.each([
      ['texto plano', 'no es json'],
      ['JSON truncado', '{"email":'],
    ])('ESC-26 cuerpo que no es JSON (%s) → 400 MALFORMED_REQUEST', async (_label, raw) => {
      await seedOperator();
      const res = await postRaw(buildApp(), raw);
      expectErrorResponse(res, 400, 'MALFORMED_REQUEST');
    });
  });

  describe('Contrato LoginRequest (RNF-02): additionalProperties false, maxLength y tipos', () => {
    // 254 y 255 caracteres con formato de email válido (parte local de 64).
    const email254 = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(56)}.test`;
    const email255 = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.test`;

    test('contrato: propiedad adicional con credenciales válidas → 422 VALIDATION_ERROR, sin token', async () => {
      await seedOperator();
      const res = await login(buildApp(), { email: OPERATOR.email, password: OPERATOR.password, extra: 'x' });
      expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    });

    test('contrato: email de 254 caracteres es válido (→ 401 INVALID_CREDENTIALS) y de 255 → 422 VALIDATION_ERROR', async () => {
      expect(email254).toHaveLength(254);
      expect(email255).toHaveLength(255);
      await seedOperator();
      const app = buildApp();
      expectErrorResponse(await login(app, { email: email254, password: OPERATOR.password }), 401, 'INVALID_CREDENTIALS');
      expectErrorResponse(await login(app, { email: email255, password: OPERATOR.password }), 422, 'VALIDATION_ERROR');
    });

    test('contrato: contraseña de 200 caracteres es válida (→ 401 INVALID_CREDENTIALS) y de 201 → 422 VALIDATION_ERROR', async () => {
      await seedOperator();
      const app = buildApp();
      expectErrorResponse(await login(app, { email: OPERATOR.email, password: 'p'.repeat(200) }), 401, 'INVALID_CREDENTIALS');
      expectErrorResponse(await login(app, { email: OPERATOR.email, password: 'p'.repeat(201) }), 422, 'VALIDATION_ERROR');
    });

    test.each([
      ['email numérico', { email: 123, password: OPERATOR.password }],
      ['contraseña numérica', { email: OPERATOR.email, password: 12345678 }],
      ['email null', { email: null, password: OPERATOR.password }],
      ['cuerpo arreglo', [OPERATOR.email, OPERATOR.password]],
      ['cuerpo cadena', 'credenciales'],
    ])('contrato: %s → 422 VALIDATION_ERROR', async (_label, body) => {
      await seedOperator();
      expectErrorResponse(await login(buildApp(), body), 422, 'VALIDATION_ERROR');
    });
  });

  test(
    'ESC-28 (b) con JWT_EXPIRES_IN corto (3s): el token emitido es aceptado y, al vencer, la operación protegida → 401 UNAUTHORIZED',
    async () => {
      // 3 s (no 1 s): exp se redondea al segundo y con 1 s la comprobación previa al vencimiento sería inestable.
      await seedOperator();
      const app = buildApp('3s');
      const res = await login(app, { email: OPERATOR.email, password: OPERATOR.password });
      expect(res.status).toBe(200);
      const { payload } = decodeJwt(res.body.token);
      expect((payload.exp as number) - (payload.iat as number)).toBe(3);
      const auth = `Bearer ${res.body.token}`;

      const fresh = await request(app).get('/api/v1/products').set('Authorization', auth);
      expect(fresh.status).not.toBe(401);

      const waitMs = new Date(res.body.expiresAt).getTime() - Date.now() + 1100;
      await sleep(Math.max(waitMs, 0));
      const expired = await request(app).get('/api/v1/products').set('Authorization', auth);
      expectErrorResponse(expired, 401, 'UNAUTHORIZED');
    },
    20_000,
  );

  test('ESC-31 sin JWT_EXPIRES_IN configurado: expiresAt = emisión + 8 horas', async () => {
    const user = await seedOperator();
    // Configuración real (loadConfig) sin JWT_EXPIRES_IN: el valor por defecto llega a createApp.
    const config = loadConfig({ DATABASE_URL: 'postgresql://qa@127.0.0.1:5432/qa', JWT_SECRET: QA_JWT_SECRET });
    const app = createApp({ auth: { jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn }, prisma: db });

    const before = nowSeconds();
    const res = await login(app, { email: OPERATOR.email, password: OPERATOR.password });
    const after = nowSeconds();

    expectLoginResponse(res, user);
    const { payload } = decodeJwt(res.body.token);
    const iat = payload.iat as number;
    const exp = payload.exp as number;
    expect(exp - iat).toBe(EIGHT_HOURS_S);
    expect(iat).toBeGreaterThanOrEqual(before);
    expect(iat).toBeLessThanOrEqual(after);
    const expiresAtMs = new Date(res.body.expiresAt).getTime();
    expect(expiresAtMs).toBe(exp * 1000);
    expect(expiresAtMs).toBeGreaterThanOrEqual((before + EIGHT_HOURS_S) * 1000);
    expect(expiresAtMs).toBeLessThanOrEqual((after + EIGHT_HOURS_S) * 1000);
  });

  test('ESC-51 ni logs ni respuestas contienen la contraseña ni su hash, en login correcto ni fallido; hash con BCRYPT_COST', async () => {
    const user = await seedOperator();
    expect(bcrypt.getRounds(user.passwordHash)).toBe(BCRYPT_COST);
    const app = buildApp();

    const output = captureOutput();
    const responses: Response[] = [];
    try {
      responses.push(await login(app, { email: OPERATOR.email, password: OPERATOR.password }));
      responses.push(await login(app, { email: OPERATOR.email, password: WRONG_PASSWORD }));
      responses.push(await login(app, { email: UNKNOWN_EMAIL, password: WRONG_PASSWORD }));
      responses.push(await login(app, { email: OPERATOR.email.toUpperCase(), password: OPERATOR.password }));
    } finally {
      output.restore();
    }

    expect(responses.map((r) => r.status)).toEqual([200, 401, 401, 200]);
    const logs = output.all();
    for (const secret of [OPERATOR.password, WRONG_PASSWORD, user.passwordHash]) {
      expect(logs).not.toContain(secret);
      for (const r of responses) {
        expect(r.text).not.toContain(secret);
        expect(JSON.stringify(r.headers)).not.toContain(secret);
      }
    }
    // Ningún hash bcrypt (real o ficticio de D3) en logs ni respuestas.
    const BCRYPT_HASH = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/;
    expect(logs).not.toMatch(BCRYPT_HASH);
    for (const r of responses) expect(r.text).not.toMatch(BCRYPT_HASH);
  });
});
