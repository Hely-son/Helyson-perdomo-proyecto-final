import { ApiError, NoSessionError, SessionExpiredError, apiRequest, setSessionLostHandler } from '../../src/api/client';
import { sessionStore } from '../../src/auth/session-store';
import type { Session } from '../../src/auth/session';

// TK-01.2 · spec 05 §15.4 (DP-05), §15.6 (D-07), §16.5. Matriz: docs/qa/TK-01.2-matrix.md.
// El cliente HTTP centralizado (TK-00.2) se extiende: `auth: true` marca una operación protegida.
// ESC-37 y ESC-47 se cubren aquí solo a nivel U, contra una operación protegida genérica (D4).
// Doble de globalThis.fetch: registra cada llamada y responde lo que indique el test.

interface FetchCall {
  url: string;
  init: RequestInit;
}

let calls: FetchCall[] = [];
let respond: () => Response = () => jsonResponse(200, {});
const realFetch = globalThis.fetch;
let lost: string[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const unauthorized = () => jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Sesión no válida o expirada.' } });
const invalidCredentials = () =>
  jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' } });

function validSession(ms = 3_600_000): Session {
  return { token: 'token-vigente', expiresAt: new Date(Date.now() + ms).toISOString(), operatorName: 'Op' };
}

function authorizationOf(call: FetchCall): string | null {
  return new Headers(call.init.headers).get('Authorization');
}

beforeEach(() => {
  calls = [];
  lost = [];
  respond = () => jsonResponse(200, { data: [] });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  sessionStore.clearSession('logout');
  sessionStore.consumeEndReason();
  setSessionLostHandler((reason) => {
    lost.push(reason);
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionLostHandler(null);
  sessionStore.clearSession('logout');
  sessionStore.consumeEndReason();
});

describe('QA-01.2-09 (§15.4): Bearer en las operaciones protegidas', () => {
  it('auth: true con sesión vigente envía Authorization: Bearer <token> y devuelve el cuerpo', async () => {
    sessionStore.setSession(validSession());
    await expect(apiRequest('/products', { auth: true })).resolves.toEqual({ data: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/v1/products');
    expect(authorizationOf(calls[0])).toBe('Bearer token-vigente');
    expect(sessionStore.getSession()).not.toBeNull();
    expect(lost).toEqual([]);
  });

  it('una petición pública (login) no envía el token aunque haya sesión', async () => {
    sessionStore.setSession(validSession());
    await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.test', password: 'x' } });
    expect(calls).toHaveLength(1);
    expect(authorizationOf(calls[0])).toBeNull();
  });
});

describe('QA-01.2-10 (ESC-47 U; DP-05): sesión vencida antes de una petición protegida', () => {
  it('con expiresAt ya pasado no llama a fetch, limpia la sesión, avisa "expired" y lanza SessionExpiredError', async () => {
    sessionStore.setSession({ ...validSession(), expiresAt: new Date(Date.now() - 1000).toISOString() });
    await expect(apiRequest('/products/1/stock-adjustments', { method: 'POST', body: {}, auth: true })).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(calls).toHaveLength(0);
    expect(sessionStore.getSession()).toBeNull();
    expect(lost).toEqual(['expired']);
    expect(sessionStore.consumeEndReason()).toBe('expired');
  });

  it('el plazo vence mientras la pantalla sigue abierta: la primera petición sale, la siguiente no', async () => {
    sessionStore.setSession(validSession(150));
    await apiRequest('/products', { auth: true });
    expect(calls).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(apiRequest('/products/1/stock-adjustments', { method: 'POST', body: {}, auth: true })).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
    expect(calls).toHaveLength(1);
    expect(sessionStore.getSession()).toBeNull();
    expect(lost).toEqual(['expired']);
  });
});

describe('QA-01.2-29 (§15.5, decisión del usuario en la fase 1): petición protegida sin sesión guardada', () => {
  it('no llama a fetch, lanza NoSessionError (distinto de SessionExpiredError), avisa "none" y no deja aviso de expiración', async () => {
    let notifications = 0;
    const unsubscribe = sessionStore.subscribe(() => {
      notifications += 1;
    });
    expect(sessionStore.getSession()).toBeNull();

    const error = await apiRequest('/products', { auth: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NoSessionError);
    expect(error).not.toBeInstanceOf(SessionExpiredError);
    expect(calls).toHaveLength(0);
    expect(lost).toEqual(['none']);
    expect(sessionStore.consumeEndReason()).not.toBe('expired');

    // Idempotente: repetirla no cambia el estado ni produce otros efectos (ni fetch, ni notificaciones del
    // almacén, ni motivos distintos de "none"). No se fija si el manejador se invoca otra vez con "none".
    await expect(apiRequest('/orders', { auth: true })).rejects.toBeInstanceOf(NoSessionError);
    expect(calls).toHaveLength(0);
    expect(sessionStore.getSession()).toBeNull();
    expect(lost.length).toBeGreaterThanOrEqual(1);
    expect(lost.every((reason) => reason === 'none')).toBe(true);
    expect(sessionStore.consumeEndReason()).not.toBe('expired');
    expect(notifications).toBe(0);
    unsubscribe();
  });
});

describe('QA-01.2-11 (ESC-37 U; §15.6, D-07): UNAUTHORIZED en una petición protegida', () => {
  it('descarta la sesión, avisa "unauthorized" y propaga ApiError con code UNAUTHORIZED', async () => {
    sessionStore.setSession(validSession());
    respond = unauthorized;
    const error = await apiRequest('/products', { auth: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNAUTHORIZED');
    expect(sessionStore.getSession()).toBeNull();
    expect(lost).toEqual(['unauthorized']);
    expect(sessionStore.consumeEndReason()).toBe('unauthorized');
  });

  it('401 sin el formato Error (sin code) en una petición protegida no cierra la sesión', async () => {
    sessionStore.setSession(validSession());
    respond = () => new Response('Unauthorized', { status: 401 });
    await expect(apiRequest('/products', { auth: true })).rejects.toBeInstanceOf(ApiError);
    expect(sessionStore.getSession()).not.toBeNull();
    expect(lost).toEqual([]);
  });

  it.each([
    [422, 'VALIDATION_ERROR'],
    [500, 'INTERNAL_ERROR'],
    [409, 'STOCK_CHANGED'],
  ])('%i %s en una petición protegida no cierra la sesión (D-09)', async (status, code) => {
    sessionStore.setSession(validSession());
    respond = () => jsonResponse(status, { error: { code, message: 'x' } });
    await expect(apiRequest('/products', { auth: true })).rejects.toBeInstanceOf(ApiError);
    expect(sessionStore.getSession()).not.toBeNull();
    expect(lost).toEqual([]);
  });
});

describe('QA-01.2-12 (§15.6): varias respuestas UNAUTHORIZED a la vez → una sola notificación', () => {
  it('tres peticiones protegidas simultáneas que reciben UNAUTHORIZED invocan el manejador una vez', async () => {
    sessionStore.setSession(validSession());
    respond = unauthorized;
    const results = await Promise.allSettled([
      apiRequest('/products', { auth: true }),
      apiRequest('/products/alerts', { auth: true }),
      apiRequest('/orders', { auth: true }),
    ]);
    expect(calls).toHaveLength(3);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(lost).toEqual(['unauthorized']);
    expect(sessionStore.getSession()).toBeNull();
  });
});

describe('QA-01.2-13 (ESC-39 U; D-07): INVALID_CREDENTIALS en login no es pérdida de sesión', () => {
  it('sin sesión: el login fallido propaga ApiError INVALID_CREDENTIALS y no invoca el manejador', async () => {
    respond = invalidCredentials;
    const error = await apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.test', password: 'x' } }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_CREDENTIALS');
    expect(lost).toEqual([]);
    expect(sessionStore.consumeEndReason()).toBeNull();
  });

  it('con una sesión presente, un login fallido no la toca', async () => {
    const current = validSession();
    sessionStore.setSession(current);
    respond = invalidCredentials;
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(sessionStore.getSession()).toEqual(current);
    expect(lost).toEqual([]);
  });

  it('UNAUTHORIZED en una petición pública tampoco cierra la sesión (solo cuenta si auth: true)', async () => {
    const current = validSession();
    sessionStore.setSession(current);
    respond = unauthorized;
    await expect(apiRequest('/health')).rejects.toBeInstanceOf(ApiError);
    expect(sessionStore.getSession()).toEqual(current);
    expect(lost).toEqual([]);
  });
});
