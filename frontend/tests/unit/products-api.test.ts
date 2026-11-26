import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ApiError, NoSessionError, SessionExpiredError, setSessionLostHandler } from '../../src/api/client';
import { sessionStore } from '../../src/auth/session-store';
import {
  adjustProductStock,
  createProduct,
  deactivateProduct,
  getProduct,
  listProducts,
  listStockAlerts,
  updateProduct,
  type AdjustStockRequest,
  type CreateProductRequest,
  type Product,
  type ProductList,
  type UpdateProductRequest,
} from '../../src/api/products';

// TK-03.3 · módulo de API de productos del frontend (src/api/products.ts), contrato docs/openapi.yaml tag Products:
// listProducts, listStockAlerts, getProduct, createProduct, updateProduct, deactivateProduct, adjustProductStock.
// Todas son operaciones protegidas (spec 05 §15.5) y pasan por apiRequest({ auth: true }) (TK-00.2, RNF-07).
// S-3 (seguimiento "TK-01.2 (seguridad, S-3 y nota)" de backlog/TRACKER.md): los ids se interpolan con
// encodeURIComponent. Matriz y contrato de interfaz: docs/qa/TK-03.3-matrix.md (API-1..API-5, S-3).

interface FetchCall {
  url: string;
  method: string;
  authorization: string | null;
  body: unknown;
}

let calls: FetchCall[] = [];
let respond: () => Response = () => jsonResponse(200, {});
let lost: string[] = [];
const realFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const SAMPLE: Product = {
  id: 7,
  name: 'Guantes de nitrilo',
  description: null,
  price: '1250.00',
  currentStock: 10,
  minStockAlert: 5,
  isActive: true,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};
const LIST: ProductList = { items: [SAMPLE] };

beforeEach(() => {
  calls = [];
  lost = [];
  respond = () => jsonResponse(200, SAMPLE);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = init?.body;
    calls.push({
      url: String(input),
      method: (init?.method ?? 'GET').toUpperCase(),
      authorization: new Headers(init?.headers).get('Authorization'),
      body: typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw,
    });
    return respond();
  }) as typeof fetch;
  setSessionLostHandler((reason) => {
    lost.push(reason);
  });
  sessionStore.setSession({ token: 'token-api', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), operatorName: 'Op' });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  setSessionLostHandler(null);
  sessionStore.clearSession('logout');
  sessionStore.consumeEndReason();
});

const create: CreateProductRequest = { name: 'Guantes de nitrilo', description: null, price: '1250.00', currentStock: 10, minStockAlert: 5 };
const update: UpdateProductRequest = { minStockAlert: 4 };
const adjust: AdjustStockRequest = { newStock: 5, expectedStock: 10 };

type Case = [name: string, run: () => Promise<unknown>, method: string, url: string, body: unknown, reply: unknown];
const CASES: Case[] = [
  ['listProducts', () => listProducts(), 'GET', '/api/v1/products', undefined, LIST],
  ['listStockAlerts', () => listStockAlerts(), 'GET', '/api/v1/products/alerts', undefined, LIST],
  ['getProduct', () => getProduct(7), 'GET', '/api/v1/products/7', undefined, SAMPLE],
  ['createProduct', () => createProduct(create), 'POST', '/api/v1/products', create, SAMPLE],
  ['updateProduct', () => updateProduct(7, update), 'PATCH', '/api/v1/products/7', update, SAMPLE],
  ['deactivateProduct', () => deactivateProduct(7), 'POST', '/api/v1/products/7/deactivate', undefined, SAMPLE],
  ['adjustProductStock', () => adjustProductStock(7, adjust), 'PATCH', '/api/v1/products/7/stock', adjust, SAMPLE],
];

describe('QA-03.3-API-1 (docs/openapi.yaml tag Products; spec 05 §15.5): una función por operación, protegida', () => {
  it.each(CASES)('%s: método, ruta, cuerpo y Bearer del contrato; devuelve el cuerpo de la respuesta', async (_, run, method, url, body, reply) => {
    respond = () => jsonResponse(method === 'POST' && url === '/api/v1/products' ? 201 : 200, reply);

    const value = await run();

    expect({ calls, value }).toEqual({
      calls: [{ url, method, authorization: 'Bearer token-api', body }],
      value: reply,
    });
  });
});

describe('QA-03.3-API-2 (DP-06, F-3; UpdateProductRequest): updateProduct envía solo los campos recibidos', () => {
  it.each([[{ price: '1300.50' }], [{ name: 'Nuevo nombre', description: null }], [{ minStockAlert: 0 }]])(
    'cuerpo %j exactamente, sin currentStock ni isActive',
    async (input) => {
      await updateProduct(7, input as UpdateProductRequest);

      expect(calls.map((c) => c.body)).toEqual([input]);
    },
  );
});

describe('QA-03.3-S-3 (TRACKER "TK-01.2 (seguridad, S-3 y nota)"): el id se interpola con encodeURIComponent', () => {
  const hostile = '7/../../auth?x=1#y' as unknown as number;
  const encoded = encodeURIComponent('7/../../auth?x=1#y');

  it.each([
    ['getProduct', () => getProduct(hostile), `/api/v1/products/${encoded}`],
    ['updateProduct', () => updateProduct(hostile, update), `/api/v1/products/${encoded}`],
    ['deactivateProduct', () => deactivateProduct(hostile), `/api/v1/products/${encoded}/deactivate`],
    ['adjustProductStock', () => adjustProductStock(hostile, adjust), `/api/v1/products/${encoded}/stock`],
  ])('%s: el segmento no altera la ruta', async (_, run, url) => {
    await run();

    expect(calls.map((c) => c.url)).toEqual([url]);
  });
});

describe('QA-03.3-API-3 (spec 05 §16.5; spec 02 §9): los errores del contrato llegan como ApiError con su code', () => {
  it.each([
    ['STOCK_CHANGED', 409, () => adjustProductStock(7, adjust)],
    ['PRODUCT_NOT_FOUND', 404, () => updateProduct(7, update)],
    ['VALIDATION_ERROR', 422, () => createProduct(create)],
    ['INTERNAL_ERROR', 500, () => listStockAlerts()],
  ])('%s (%i): se propaga sin cerrar la sesión', async (code, status, run) => {
    respond = () => jsonResponse(status, { error: { code, message: `mensaje ${code}` } });

    const error = await run().then(
      () => null,
      (e: unknown) => e,
    );

    expect({
      isApiError: error instanceof ApiError,
      code: (error as ApiError | null)?.code,
      status: (error as ApiError | null)?.status,
      session: sessionStore.getSession() !== null,
      lost,
    }).toEqual({ isApiError: true, code, status, session: true, lost: [] });
  });
});

describe('QA-03.3-API-4 (ESC-47 nivel módulo; spec 05 §15.4 DP-05): con la sesión vencida ninguna operación envía la petición', () => {
  it.each(CASES)('%s: SessionExpiredError y 0 peticiones', async (_, run) => {
    sessionStore.setSession({ token: 'token-vencido', expiresAt: new Date(Date.now() - 1_000).toISOString(), operatorName: 'Op' });

    const error = await run().then(
      () => null,
      (e: unknown) => e,
    );

    expect({ expired: error instanceof SessionExpiredError, calls: calls.length, lost }).toEqual({
      expired: true,
      calls: 0,
      lost: ['expired'],
    });
  });

  it.each(CASES)('%s: sin sesión, NoSessionError y 0 peticiones', async (_, run) => {
    sessionStore.clearSession('logout');
    sessionStore.consumeEndReason();

    const error = await run().then(
      () => null,
      (e: unknown) => e,
    );

    expect({ noSession: error instanceof NoSessionError, calls: calls.length }).toEqual({ noSession: true, calls: 0 });
  });
});
