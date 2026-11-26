import request, { type Response } from 'supertest';
import type { Express } from 'express';
import { createApp, type CreateAppOptions } from '../../src/app';
import { ChatSessionStore } from '../../src/modules/chat/session-store';
import { expectErrorResponse } from '../helpers/error-response';
import { QA_JWT_SECRET } from '../helpers/jwt';
import { connectTestPrisma, type Db } from './helpers/products';

// TK-05.1 · Pruebas de aceptación de QA (fase 1): identificación y expiración a través de los endpoints del chat,
// contra PostgreSQL real (medsupply_test, RNF-01). Spec 03 §4.1, F-1, F-2, §7, §8, §10.1, §10.2; contrato
// docs/openapi.yaml, operaciones startChatSession y sendChatMessage (RNF-02).
// Escenarios: ESC-01, ESC-02, ESC-03, ESC-04, ESC-05, ESC-07 (parcial, D-E), ESC-08 (a través del endpoint).
// Interfaz asumida: createApp({ auth, prisma, chatSessionStore }) con un ChatSessionStore<…>({ ttlMinutes }) inyectado.
// Reloj controlado: Date.now espiado y congelado, avanza solo con un desplazamiento (el almacén lee Date.now); sin esperas reales.
// La limpieza global vacía la base antes de cada test. Datos ficticios.
// Matriz: docs/qa/TK-05.1-matrix.md

type Store = NonNullable<CreateAppOptions['chatSessionStore']>;

const MIN = 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_INVALID_TEXT = 'La conversación no es válida o expiró. Inicia una nueva conversación.';
const ACTIVE_PHONE = '+56912345678';
const INACTIVE_PHONE = '+56987654321';
const BUSINESS_NAME = 'Clínica Los Andes';

let db: Db;
let offsetMs = 0;
let nowSpy: jest.SpyInstance;

beforeAll(async () => {
  db = await connectTestPrisma();
});
afterAll(async () => {
  await db?.$disconnect();
});
beforeEach(() => {
  offsetMs = 0;
  const base = Date.now();
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => base + offsetMs); // reloj congelado: solo avanza con offsetMs
});
afterEach(() => {
  nowSpy.mockRestore();
});

function build(ttlMinutes: number): { app: Express; store: Store } {
  const store: Store = new ChatSessionStore({ ttlMinutes });
  const app = createApp({ auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' }, prisma: db, chatSessionStore: store });
  return { app, store };
}

const startSession = (app: Express, body: unknown) =>
  request(app).post('/api/v1/chat/sessions').set('Content-Type', 'application/json').send(JSON.stringify(body));
const sendMessage = (app: Express, id: string, text: string) =>
  request(app)
    .post(`/api/v1/chat/sessions/${id}/messages`)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ text }));

async function seedCustomers() {
  const active = await db.customer.create({
    data: { businessName: BUSINESS_NAME, taxId: '76.111.111-1', phone: ACTIVE_PHONE, isActive: true },
  });
  const inactive = await db.customer.create({
    data: { businessName: 'Farmacia Inactiva', taxId: '76.222.222-2', phone: INACTIVE_PHONE, isActive: false },
  });
  return { active, inactive };
}

const botText = (res: Response): string => (res.body.messages as { text: string }[]).map((m) => m.text).join('\n');

/** La respuesta de ChatReply: exactamente sessionId, active y messages (minItems 1, cada uno con solo `text`). */
function expectChatReplyShape(res: Response): void {
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(Object.keys(res.body).sort()).toEqual(['active', 'messages', 'sessionId']);
  expect(typeof res.body.active).toBe('boolean');
  expect(Array.isArray(res.body.messages)).toBe(true);
  expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
  for (const m of res.body.messages) {
    expect(Object.keys(m)).toEqual(['text']);
    expect(typeof m.text).toBe('string');
    expect(m.text.length).toBeGreaterThan(0);
  }
}

function expectMvpMenu(text: string): void {
  expect(text).toMatch(/1\)/);
  expect(text).toMatch(/Cat[aá]logo/i);
  expect(text).toMatch(/2\)/);
  expect(text).toMatch(/Mis pedidos/i);
  expect(text).not.toMatch(/3\)/);
  expect(text).not.toMatch(/reclam/i);
}

/** Respuesta CH-02: sin sesión, sin menú, con el mensaje de contactar a la distribuidora. */
function expectNotRecognized(res: Response, store: Store): void {
  expect(res.status).toBe(200);
  expectChatReplyShape(res);
  expect(res.body.sessionId).toBeNull();
  expect(res.body.active).toBe(false);
  const text = botText(res);
  expect(text).toMatch(/distribuidora/i);
  expect(text).not.toMatch(/1\)/);
  expect(text).not.toMatch(/Mis pedidos/i);
  expect(store.size).toBe(0);
}

describe('TK-05.1 · ESC-01 identificación de un cliente activo (CH-02, CH-03, CL-03, RN-12)', () => {
  test('ESC-01 · tres formatos del mismo teléfono → tres sesiones del mismo cliente (201), con saludo y menú solo con 1) y 2)', async () => {
    const { active } = await seedCustomers();
    const { app, store } = build(30);
    const ids: string[] = [];
    for (const phone of ['9 1234 5678', '912345678', '+56 9 1234 5678']) {
      const res = await startSession(app, { phone });
      expect(res.status).toBe(201);
      expectChatReplyShape(res);
      expect(res.body.active).toBe(true);
      expect(res.body.sessionId).toMatch(UUID_RE);
      const text = botText(res);
      expect(text).toContain(BUSINESS_NAME); // saludo con el nombre del cliente (ejemplo del contrato)
      expectMvpMenu(text);
      const session = store.get(res.body.sessionId);
      expect(session?.customerId).toBe(active.id);
      expect(session?.state).toBe('MAIN_MENU');
      expect(session?.cart).toEqual([]);
      ids.push(res.body.sessionId);
    }
    expect(new Set(ids).size).toBe(3);
    expect(store.size).toBe(3);
  });

  test('ESC-01 · identificar no modifica al cliente', async () => {
    const { active } = await seedCustomers();
    const { app } = build(30);
    expect((await startSession(app, { phone: '9 1234 5678' })).status).toBe(201);
    expect(await db.customer.findUniqueOrThrow({ where: { id: active.id } })).toEqual(active);
    expect(await db.customer.count()).toBe(2);
  });
});

describe('TK-05.1 · ESC-02/03/04 teléfono no reconocido (CH-02, CL-02, RN-12, CA-06 · parte API)', () => {
  test('ESC-02 · teléfono sin cliente → 200, sessionId null, active false, mensaje de contacto, sin menú y sin sesión', async () => {
    await seedCustomers();
    const { app, store } = build(30);
    expectNotRecognized(await startSession(app, { phone: '+56 9 0000 0000' }), store);
  });

  test('ESC-03 · teléfono de un cliente inactivo (en tres formatos) → igual que ESC-02, sin modificar al cliente', async () => {
    const { inactive } = await seedCustomers();
    const { app, store } = build(30);
    for (const phone of [INACTIVE_PHONE, '987654321', '9 8765 4321']) {
      expectNotRecognized(await startSession(app, { phone }), store);
    }
    expect(await db.customer.findUniqueOrThrow({ where: { id: inactive.id } })).toEqual(inactive);
  });

  test.each(['abc', '   ', '94907687', '+56 9 1234', '9 11 1234 5678 99'])(
    'ESC-04 · el teléfono inválido o no normalizable %j → igual que ESC-02 (sin exponer el motivo)',
    async (phone) => {
      await seedCustomers();
      const { app, store } = build(30);
      expectNotRecognized(await startSession(app, { phone }), store);
    },
  );

  test('F-1 · la respuesta es la misma en los cuatro casos (no registrado, inactivo, formato inválido, solo espacios)', async () => {
    await seedCustomers();
    const { app } = build(30);
    const bodies: unknown[] = [];
    for (const phone of ['+56 9 0000 0000', INACTIVE_PHONE, 'abc', '   ']) {
      const res = await startSession(app, { phone });
      expect(res.status).toBe(200);
      bodies.push(res.body);
    }
    for (const b of bodies.slice(1)) expect(b).toEqual(bodies[0]);
  });

  test('ESC-04 · límite del contrato: un teléfono de 30 espacios no es error de validación (200, sin sesión); 31 caracteres sí (422)', async () => {
    const { app, store } = build(30);
    expectNotRecognized(await startSession(app, { phone: ' '.repeat(30) }), store);
    expectErrorResponse(await startSession(app, { phone: ' '.repeat(31) }), 422, 'VALIDATION_ERROR');
    expect(store.size).toBe(0);
  });
});

describe('TK-05.1 · ESC-05 teléfono ausente o vacío (VALIDATION_ERROR, RN-12)', () => {
  test.each([
    ['phone ausente', {}],
    ['phone vacío ""', { phone: '' }],
    ['phone nulo', { phone: null }],
    ['phone numérico', { phone: 912345678 }],
    ['propiedad adicional', { phone: '912345678', extra: 1 }],
  ])('ESC-05 · %s → 422 VALIDATION_ERROR y no se crea sesión', async (_name, body) => {
    await seedCustomers();
    const { app, store } = build(30);
    expectErrorResponse(await startSession(app, body), 422, 'VALIDATION_ERROR');
    expect(store.size).toBe(0);
  });
});

describe('TK-05.1 · ESC-07 (parcial, D-E) un mensaje de una sesión vigente se procesa con active true (CH-11, DP-11)', () => {
  // D-E: se verifica solo que el mensaje se procesa, `active: true` y la transición a CATALOG.
  // El contenido del catálogo (productos, precios, "Sin stock") queda para TK-05.2.
  test('ESC-07 · sesión activa, TTL 30, `1` a los 10 minutos → 200 con active true y sessionId; el estado pasa a CATALOG', async () => {
    await seedCustomers();
    const { app, store } = build(30);
    const started = await startSession(app, { phone: ACTIVE_PHONE });
    const id: string = started.body.sessionId;
    offsetMs = 10 * MIN;
    const res = await sendMessage(app, id, '1');
    expect(res.status).toBe(200);
    expectChatReplyShape(res);
    expect(res.body.active).toBe(true);
    expect(res.body.sessionId).toBe(id);
    expect(store.get(id)?.state).toBe('CATALOG');
  });

  test('DP-11 · toda respuesta normal lleva active true: entrada inválida, `2` y `0`', async () => {
    await seedCustomers();
    const { app, store } = build(30);
    const id: string = (await startSession(app, { phone: ACTIVE_PHONE })).body.sessionId;
    for (const [text, state] of [
      ['xyz', 'MAIN_MENU'],
      ['3', 'MAIN_MENU'],
      ['2', 'ORDER_LOOKUP'],
      ['0', 'MAIN_MENU'],
    ] as const) {
      const res = await sendMessage(app, id, text);
      expect(res.status).toBe(200);
      expectChatReplyShape(res);
      expect(res.body.active).toBe(true);
      expect(store.get(id)?.state).toBe(state);
    }
  });

  test('ESC-14 (por HTTP) · `3` en el menú repite el menú con solo 1) y 2), sin error HTTP', async () => {
    await seedCustomers();
    const { app } = build(30);
    const id: string = (await startSession(app, { phone: ACTIVE_PHONE })).body.sessionId;
    const res = await sendMessage(app, id, '3');
    expect(res.status).toBe(200);
    expectMvpMenu(botText(res));
  });

  test('CH-03 · `0` desde el catálogo vuelve al menú por HTTP', async () => {
    await seedCustomers();
    const { app, store } = build(30);
    const id: string = (await startSession(app, { phone: ACTIVE_PHONE })).body.sessionId;
    await sendMessage(app, id, '1');
    const res = await sendMessage(app, id, '0');
    expect(res.status).toBe(200);
    expectMvpMenu(botText(res));
    expect(store.get(id)?.state).toBe('MAIN_MENU');
  });
});

describe('TK-05.1 · ESC-08 expiración a través del endpoint (CH-11, CA-16, DP-05)', () => {
  test('ESC-08 · TTL de 1 minuto: tras superarlo, el mensaje y el siguiente → 404 SESSION_INVALID con el texto del contrato; el primero no se procesa; una sesión nueva del mismo teléfono empieza con carrito vacío', async () => {
    await seedCustomers();
    const { app, store } = build(1);
    const started = await startSession(app, { phone: ACTIVE_PHONE });
    const id: string = started.body.sessionId;

    // 1 ítem en el carrito (la gestión real del carrito es de TK-05.2: se coloca directamente en la sesión).
    const session = store.get(id)!;
    (session.cart as unknown as unknown[]).push({ productId: 1, quantity: 1 });
    const cartBefore = structuredClone(session.cart);

    offsetMs = 1 * MIN + 1; // inactividad estrictamente mayor que el TTL (D-3c)
    const first = await sendMessage(app, id, '1');
    expectErrorResponse(first, 404, 'SESSION_INVALID');
    expect(first.body.error.message).toBe(SESSION_INVALID_TEXT);
    expect(first.text).not.toContain(id);
    // No se procesó: la sesión (referencia previa) sigue en MAIN_MENU con su carrito original, y fue descartada.
    expect(session.state).toBe('MAIN_MENU');
    expect(session.cart).toEqual(cartBefore);
    expect(store.get(id)).toBeUndefined();
    expect(store.size).toBe(0);

    const second = await sendMessage(app, id, '0');
    expectErrorResponse(second, 404, 'SESSION_INVALID');
    expect(second.body.error.message).toBe(SESSION_INVALID_TEXT);

    const fresh = await startSession(app, { phone: ACTIVE_PHONE });
    expect(fresh.status).toBe(201);
    expect(fresh.body.sessionId).toMatch(UUID_RE);
    expect(fresh.body.sessionId).not.toBe(id);
    expect(store.get(fresh.body.sessionId)?.cart).toEqual([]);
    expect(store.get(fresh.body.sessionId)?.state).toBe('MAIN_MENU');
  });

  test('ESC-08 · límite: con inactividad exactamente igual al TTL la sesión sigue vigente (200); con TTL + 1 ms expira', async () => {
    await seedCustomers();
    const { app } = build(1);
    const id: string = (await startSession(app, { phone: ACTIVE_PHONE })).body.sessionId;
    offsetMs = 1 * MIN;
    const ok = await sendMessage(app, id, 'xyz'); // procesado: renueva el plazo desde aquí
    expect(ok.status).toBe(200);
    offsetMs = 1 * MIN + 1 * MIN + 1;
    expectErrorResponse(await sendMessage(app, id, '1'), 404, 'SESSION_INVALID');
  });

  test('ESC-08 · la expiración de una sesión no afecta a otra del mismo cliente (DP-09)', async () => {
    await seedCustomers();
    const { app, store } = build(2);
    const a: string = (await startSession(app, { phone: ACTIVE_PHONE })).body.sessionId;
    offsetMs = 1 * MIN;
    const b: string = (await startSession(app, { phone: ACTIVE_PHONE })).body.sessionId;
    offsetMs = 2 * MIN + 1; // A inactiva más de 2 min; B, solo 1 min y 1 ms
    expectErrorResponse(await sendMessage(app, a, '1'), 404, 'SESSION_INVALID');
    const res = await sendMessage(app, b, '1');
    expect(res.status).toBe(200);
    expect(store.get(b)?.state).toBe('CATALOG');
  });
});
