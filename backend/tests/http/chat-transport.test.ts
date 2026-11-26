import request from 'supertest';
import type { Express } from 'express';
import type { CreateAppOptions } from '../../src/app';
import { ChatSessionStore } from '../../src/modules/chat/session-store';
import { expectErrorResponse } from '../helpers/error-response';
import { createTestApp } from '../helpers/app';

// TK-05.1 · Pruebas de aceptación de QA (fase 1): transporte de los endpoints del chat, sin base de datos
// (las sesiones se crean directamente en el almacén inyectado; los rechazos ocurren antes de cualquier consulta).
// Spec 03 §4.1 (DP-06), F-2, §7, §8; contrato docs/openapi.yaml, operaciones startChatSession y sendChatMessage (RNF-02).
// Escenarios: ESC-09, ESC-10, ESC-45 (parte de transporte), 400 por JSON inválido, sessionId no expuesto (RNF-08).
// Interfaz asumida: CreateAppOptions.chatSessionStore (opcional); estado inicial 'MAIN_MENU' y carrito [] en store.create.
// Reloj controlado: Date.now espiado y congelado, avanza solo con un desplazamiento (el almacén lee Date.now). Sin esperas reales.
// Matriz: docs/qa/TK-05.1-matrix.md

type Store = NonNullable<CreateAppOptions['chatSessionStore']>;

const MIN = 60_000;
const TTL = 30;
const SESSION_INVALID_TEXT = 'La conversación no es válida o expiró. Inicia una nueva conversación.';
const UNKNOWN_UUID = '3f1c2a9e-8b7d-4c1e-9f0a-2b6d5e4c3a21';

let offsetMs = 0;
let nowSpy: jest.SpyInstance;
let store: Store;
let app: Express;

beforeEach(() => {
  offsetMs = 0;
  const base = Date.now();
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => base + offsetMs); // reloj congelado: solo avanza con offsetMs
  store = new ChatSessionStore({ ttlMinutes: TTL });
  app = createTestApp({ chatSessionStore: store });
});
afterEach(() => {
  nowSpy.mockRestore();
});

const messagesPath = (id: string) => `/api/v1/chat/sessions/${id}/messages`;
const sendJson = (id: string, body: unknown) =>
  request(app).post(messagesPath(id)).set('Content-Type', 'application/json').send(JSON.stringify(body));
const sendRaw = (id: string, raw: string) =>
  request(app).post(messagesPath(id)).set('Content-Type', 'application/json').send(raw);
const newSession = () => store.create({ customerId: 1, state: 'MAIN_MENU', cart: [] });
const snapshot = () => {
  const out: Record<string, unknown> = {};
  for (const id of knownIds) {
    const s = store.get(id);
    out[id] = s && { state: s.state, cart: structuredClone(s.cart), lastProcessedAt: s.lastProcessedAt };
  }
  return out;
};
const knownIds: string[] = [];
beforeEach(() => {
  knownIds.length = 0;
});
const trackedSession = () => {
  const s = newSession();
  knownIds.push(s.id);
  return s;
};

const expectNoEcho = (res: { text: string }, value: string) => expect(res.text).not.toContain(value);

describe('TK-05.1 · ESC-09 sesión inexistente (CH-11)', () => {
  test('ESC-09 · un UUID válido sin sesión responde 404 SESSION_INVALID con el texto de ejemplo del contrato (DP-05) y no lo repite', async () => {
    const res = await sendJson(UNKNOWN_UUID, { text: '1' });
    expectErrorResponse(res, 404, 'SESSION_INVALID');
    expect(res.body.error.message).toBe(SESSION_INVALID_TEXT);
    expectNoEcho(res, UNKNOWN_UUID);
    expect(store.size).toBe(0);
  });

  test('ESC-09 · un mensaje a una sesión inexistente no crea sesiones ni modifica las existentes', async () => {
    const s = trackedSession();
    const before = snapshot();
    const res = await sendJson(UNKNOWN_UUID, { text: '1' });
    expectErrorResponse(res, 404, 'SESSION_INVALID');
    expect(snapshot()).toEqual(before);
    expect(store.get(s.id)).toBe(s);
    expect(store.size).toBe(1);
  });

  test('sin almacén inyectado la aplicación expone igualmente la ruta: UUID desconocido → SESSION_INVALID (no NOT_FOUND)', async () => {
    const bare = createTestApp();
    const res = await request(bare)
      .post(messagesPath(UNKNOWN_UUID))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: '1' }));
    expectErrorResponse(res, 404, 'SESSION_INVALID');
  });
});

describe('TK-05.1 · ESC-10 validación del contrato en sendChatMessage (422, sin cambios en ninguna sesión)', () => {
  test.each(['abc', '123', 'not-a-uuid', `${UNKNOWN_UUID}x`, UNKNOWN_UUID.slice(1)])(
    'ESC-10 · sessionId %j que no es UUID → 422 VALIDATION_ERROR sin repetir el valor y sin tocar sesiones',
    async (badId) => {
      trackedSession();
      const before = snapshot();
      const res = await sendJson(badId, { text: '1' });
      expectErrorResponse(res, 422, 'VALIDATION_ERROR');
      expectNoEcho(res, badId);
      expect(snapshot()).toEqual(before);
    },
  );

  test.each([
    ['text de 501 caracteres', { text: 'a'.repeat(501) }],
    ['text ausente', {}],
    ['text no es string', { text: 1 }],
    ['text nulo', { text: null }],
    ['propiedad adicional (additionalProperties: false)', { text: '1', extra: true }],
    ['cuerpo JSON no objeto', ['1']],
  ])('ESC-10 · %s sobre una sesión activa → 422 VALIDATION_ERROR sin procesar ni renovar', async (_name, body) => {
    const s = trackedSession();
    const before = snapshot();
    offsetMs = 5 * MIN;
    const res = await sendJson(s.id, body);
    expectErrorResponse(res, 422, 'VALIDATION_ERROR');
    expectNoEcho(res, s.id);
    expect(snapshot()).toEqual(before);
  });

  test('ESC-10 · límites del contrato: text de exactamente 500 caracteres y text vacío son válidos (200, active true; el bot los trata como entrada inválida)', async () => {
    const s = trackedSession();
    for (const text of ['a'.repeat(500), '']) {
      const res = await sendJson(s.id, { text });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.body.active).toBe(true);
      expect(res.body.sessionId).toBe(s.id);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
    }
    expect(store.get(s.id)?.state).toBe('MAIN_MENU');
  });
});

describe('TK-05.1 · 400 MALFORMED_REQUEST por JSON inválido (DP-06, ESC-45)', () => {
  test('sendChatMessage con JSON inválido → 400 MALFORMED_REQUEST sin procesar ni renovar el plazo', async () => {
    const s = trackedSession();
    const before = snapshot();
    offsetMs = 5 * MIN;
    const res = await sendRaw(s.id, '{"text": ');
    expectErrorResponse(res, 400, 'MALFORMED_REQUEST');
    expect(snapshot()).toEqual(before);
  });

  test('sendChatMessage con JSON inválido sobre un sessionId inexistente → 400 (el cuerpo se rechaza antes de buscar la sesión)', async () => {
    expectErrorResponse(await sendRaw(UNKNOWN_UUID, '{no es json'), 400, 'MALFORMED_REQUEST');
  });

  test('startChatSession con JSON inválido → 400 MALFORMED_REQUEST y no crea sesión', async () => {
    const res = await request(app)
      .post('/api/v1/chat/sessions')
      .set('Content-Type', 'application/json')
      .send('{"phone": ');
    expectErrorResponse(res, 400, 'MALFORMED_REQUEST');
    expect(store.size).toBe(0);
  });
});

describe('TK-05.1 · ESC-45 (parte de transporte) los rechazos de transporte no renuevan el plazo (DP-06)', () => {
  test('ESC-45 · sesión A: entrada inválida en T−1 min renueva y `1` en T+1 min se procesa; sesión B: rechazos de transporte en T−1 min no renuevan y `1` en T+1 min recibe SESSION_INVALID', async () => {
    const a = trackedSession();
    const b = trackedSession();
    const t0 = a.lastProcessedAt;
    expect(b.lastProcessedAt).toBe(t0);

    // t = T−1 min
    offsetMs = (TTL - 1) * MIN;
    const invalidInput = await sendJson(a.id, { text: 'xyz' });
    expect(invalidInput.status).toBe(200);
    expect(invalidInput.body.active).toBe(true);
    expect(a.lastProcessedAt).toBeGreaterThan(t0); // la entrada conversacional inválida renueva

    expectErrorResponse(await sendJson(b.id, { text: 'a'.repeat(501) }), 422, 'VALIDATION_ERROR');
    expectErrorResponse(await sendJson(b.id, {}), 422, 'VALIDATION_ERROR');
    expectErrorResponse(await sendRaw(b.id, '{"text": '), 400, 'MALFORMED_REQUEST');
    expect(store.get(b.id)?.lastProcessedAt).toBe(t0); // ningún rechazo de transporte renovó el plazo

    // t = T+1 min
    offsetMs = (TTL + 1) * MIN;
    const okA = await sendJson(a.id, { text: '1' });
    expect(okA.status).toBe(200);
    expect(okA.body.active).toBe(true);
    expect(store.get(a.id)?.state).toBe('CATALOG');

    const rejectedB = await sendJson(b.id, { text: '1' });
    expectErrorResponse(rejectedB, 404, 'SESSION_INVALID');
    expect(rejectedB.body.error.message).toBe(SESSION_INVALID_TEXT);
    expect(store.get(b.id)).toBeUndefined(); // descartada
  });

  test('ESC-45 · una petición con sesión inválida (SESSION_INVALID) tampoco renueva ni crea nada', async () => {
    const s = trackedSession();
    const t0 = s.lastProcessedAt;
    offsetMs = (TTL - 1) * MIN;
    expectErrorResponse(await sendJson(UNKNOWN_UUID, { text: 'xyz' }), 404, 'SESSION_INVALID');
    expect(store.get(s.id)?.lastProcessedAt).toBe(t0);
    expect(store.size).toBe(1);
  });
});
