import { describe, expect, it } from '@jest/globals';
import { ApiError, NoSessionError, SessionExpiredError } from '../../src/api/client';
import type { Product } from '../../src/api/products';
import { buildAdjustStockRequest, classifyProductError, criticalProductIds, runProductAction } from '../../src/products/inventory';

// TK-03.3 · lógica pura de la pantalla de inventario (src/products/inventory.ts), sin React ni red. Decisión D1 de la
// puerta 1: las pruebas fijan los nombres y las firmas (contrato en docs/qa/TK-03.3-matrix.md).
// - criticalProductIds: DP-04 de la spec 02 y spec 05 §16.4 pasos 2-5 (cruce por id con listStockAlerts; sin RN-09 local).
// - buildAdjustStockRequest: TK-03.3 "envía el stock mostrado como expectedStock" (spec 02 F-5, IN-02, CA-13).
// - classifyProductError: spec 05 §16.5 (D-09) y spec 02 §9; las decisiones se toman por `code`, nunca por `message`.
//   MALFORMED_REQUEST: decisión del usuario O-1 (2026-11-26), mensaje genérico dentro del formulario.
// - runProductAction: spec 05 §16.4 "recargas" (éxito, STOCK_CHANGED y PRODUCT_NOT_FOUND → ambas listas).

function p(id: number, currentStock: number, minStockAlert: number, isActive = true): Product {
  return {
    id,
    name: `Producto ${id}`,
    description: null,
    price: '1250.00',
    currentStock,
    minStockAlert,
    isActive,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  };
}

const A = p(1, 3, 3);
const B = p(2, 2, 3);
const C = p(3, 9, 3);
const D = p(4, 1, 3, false);
const CATALOG = [A, B, C, D];

const sorted = (ids: ReadonlySet<number>) => [...ids].sort((x, y) => x - y);

describe('QA-03.3-ESC-52 / ESC-53 (DP-04; §16.4): criticalProductIds cruza ids y no calcula RN-09', () => {
  it('ESC-52: con alertas [B] solo B; A (3/3) no, aunque su catálogo parezca cumplir RN-09; C y D (inactivo) no', () => {
    expect(sorted(criticalProductIds(CATALOG, [B]))).toEqual([2]);
  });

  it('ESC-53: alertas no disponibles (null) → ningún id, aunque haya un activo 2/3', () => {
    expect(sorted(criticalProductIds(CATALOG, null))).toEqual([]);
  });

  it('guarda de cruce puro: si alertas trae C (9/3) se resalta C; no compara currentStock con minStockAlert', () => {
    expect(sorted(criticalProductIds(CATALOG, [C]))).toEqual([3]);
  });

  it('guarda de cruce puro: no evalúa isActive (§16.4 paso 4); el inactivo se excluye solo porque el backend no lo envía', () => {
    expect(sorted(criticalProductIds(CATALOG, [D]))).toEqual([4]);
  });

  it('un id de alertas que no figura en el catálogo se ignora (§16.4)', () => {
    expect(sorted(criticalProductIds(CATALOG, [B, p(999, 0, 3)]))).toEqual([2]);
  });

  it('catálogo vacío → ningún id', () => {
    expect(sorted(criticalProductIds([], [B]))).toEqual([]);
  });
});

describe('QA-03.3-ADJ (TK-03.3; spec 02 F-5 paso 2): buildAdjustStockRequest', () => {
  it('envía el stock mostrado como expectedStock y el nuevo valor absoluto como newStock, sin otros campos', () => {
    expect(buildAdjustStockRequest(p(9, 10, 5), 25)).toEqual({ newStock: 25, expectedStock: 10 });
    expect(buildAdjustStockRequest(p(9, 0, 5, false), 3)).toEqual({ newStock: 3, expectedStock: 0 });
  });
});

const SERVER_TEXT = 'PrismaClientKnownRequestError at products.service.ts:42 token=abc';

describe('QA-03.3-ERR (spec 05 §16.5 D-09; spec 02 §9): classifyProductError por code', () => {
  it('ESC-44: VALIDATION_ERROR → validation con el message del backend tal cual (para el formulario)', () => {
    expect(classifyProductError(new ApiError(422, 'VALIDATION_ERROR', 'El precio debe ser mayor que 0.'))).toEqual({
      kind: 'validation',
      message: 'El precio debe ser mayor que 0.',
    });
  });

  it('ESC-43: STOCK_CHANGED → conflict, recarga ambas listas, mensaje propio sobre el stock (no el del servidor)', () => {
    const outcome = classifyProductError(new ApiError(409, 'STOCK_CHANGED', SERVER_TEXT));
    expect({
      kind: outcome.kind,
      reloadLists: 'reloadLists' in outcome ? outcome.reloadLists : undefined,
      aboutStock: 'message' in outcome && /stock/i.test(outcome.message),
      leaks: 'message' in outcome && (outcome.message.includes(SERVER_TEXT) || outcome.message.includes('STOCK_CHANGED')),
    }).toEqual({ kind: 'conflict', reloadLists: true, aboutStock: true, leaks: false });
  });

  it('§16.4: PRODUCT_NOT_FOUND → not-found, recarga ambas listas, mensaje propio sobre el producto', () => {
    const outcome = classifyProductError(new ApiError(404, 'PRODUCT_NOT_FOUND', SERVER_TEXT));
    expect({
      kind: outcome.kind,
      reloadLists: 'reloadLists' in outcome ? outcome.reloadLists : undefined,
      aboutProduct: 'message' in outcome && /producto/i.test(outcome.message),
      leaks: 'message' in outcome && (outcome.message.includes(SERVER_TEXT) || outcome.message.includes('PRODUCT_NOT_FOUND')),
    }).toEqual({ kind: 'not-found', reloadLists: true, aboutProduct: true, leaks: false });
  });

  it.each([
    ['INTERNAL_ERROR', new ApiError(500, 'INTERNAL_ERROR', SERVER_TEXT)],
    ['fallo de red', new ApiError(0, null, 'No se pudo conectar con el servidor.')],
    ['respuesta sin formato Error', new ApiError(502, null, 'Bad Gateway')],
    ['error inesperado', new TypeError(SERVER_TEXT)],
  ])('ESC-42: %s → technical, mensaje genérico sin detalles técnicos', (_, error) => {
    const outcome = classifyProductError(error);
    const message = 'message' in outcome ? outcome.message : '';
    expect({
      kind: outcome.kind,
      hasMessage: message.length > 0,
      leaks: [SERVER_TEXT, 'INTERNAL_ERROR', 'Bad Gateway', 'Prisma', 'token'].some((s) => message.includes(s)),
    }).toEqual({ kind: 'technical', hasMessage: true, leaks: false });
  });

  it.each([
    ['UNAUTHORIZED', new ApiError(401, 'UNAUTHORIZED', 'Sesión no válida o expirada.')],
    ['SessionExpiredError (ESC-47)', new SessionExpiredError()],
    ['NoSessionError', new NoSessionError()],
  ])('§15.6: %s → session, sin mensaje (el flujo de sesión ya redirige a /login)', (_, error) => {
    expect(classifyProductError(error)).toEqual({ kind: 'session' });
  });

  it('O-1 (decisión del usuario, 2026-11-26): MALFORMED_REQUEST → validation con un mensaje genérico propio, sin el del servidor', () => {
    // "validation": se muestra dentro del formulario, sin cerrar el modal ni recargar (los datos ingresados se conservan).
    const outcome = classifyProductError(new ApiError(400, 'MALFORMED_REQUEST', SERVER_TEXT));
    const message = 'message' in outcome ? outcome.message : '';
    expect({
      kind: outcome.kind,
      hasMessage: message.length > 0,
      leaks: [SERVER_TEXT, 'MALFORMED_REQUEST', 'Prisma', 'token'].some((s) => message.includes(s)),
    }).toEqual({ kind: 'validation', hasMessage: true, leaks: false });
  });

  it('decide por code, no por message: un VALIDATION_ERROR con texto de "stock cambió" sigue siendo validation', () => {
    expect(classifyProductError(new ApiError(422, 'VALIDATION_ERROR', 'El stock cambió')).kind).toBe('validation');
  });
});

describe('QA-03.3-RELOAD (spec 05 §16.4 recargas; ESC-43, 44, 54, 55): runProductAction', () => {
  async function run(action: () => Promise<unknown>) {
    let reloads = 0;
    const result = await runProductAction(action, () => {
      reloads += 1;
    });
    return { result, reloads };
  }

  it('ESC-54/55: éxito → { ok: true, value } y recarga una vez', async () => {
    const value = p(5, 5, 5);
    expect(await run(() => Promise.resolve(value))).toEqual({ result: { ok: true, value }, reloads: 1 });
  });

  it.each([
    ['STOCK_CHANGED', 409, 'conflict'],
    ['PRODUCT_NOT_FOUND', 404, 'not-found'],
  ])('ESC-43: %s → { ok: false } y recarga una vez', async (code, status, kind) => {
    const { result, reloads } = await run(() => Promise.reject(new ApiError(status, code, 'x')));
    expect({ ok: result.ok, kind: result.ok ? null : result.error.kind, reloads }).toEqual({ ok: false, kind, reloads: 1 });
  });

  it('ESC-44: VALIDATION_ERROR → { ok: false, validation } y no recarga', async () => {
    const { result, reloads } = await run(() => Promise.reject(new ApiError(422, 'VALIDATION_ERROR', 'Dato fuera de esquema.')));
    expect({ result, reloads }).toEqual({
      result: { ok: false, error: { kind: 'validation', message: 'Dato fuera de esquema.' } },
      reloads: 0,
    });
  });

  it('O-1: MALFORMED_REQUEST → { ok: false, validation } y no recarga', async () => {
    const { result, reloads } = await run(() => Promise.reject(new ApiError(400, 'MALFORMED_REQUEST', 'JSON inválido')));
    expect({ ok: result.ok, kind: result.ok ? null : result.error.kind, reloads }).toEqual({ ok: false, kind: 'validation', reloads: 0 });
  });

  it.each([
    ['UNAUTHORIZED', new ApiError(401, 'UNAUTHORIZED', 'x')],
    ['SessionExpiredError', new SessionExpiredError()],
    ['NoSessionError', new NoSessionError()],
  ])('§15.6: %s → { ok: false, session } y no recarga', async (_, error) => {
    expect(await run(() => Promise.reject(error))).toEqual({ result: { ok: false, error: { kind: 'session' } }, reloads: 0 });
  });

  it('nunca rechaza: un error inesperado se devuelve como technical', async () => {
    const { result } = await run(() => Promise.reject(new Error('boom')));
    expect({ ok: result.ok, kind: result.ok ? null : result.error.kind }).toEqual({ ok: false, kind: 'technical' });
  });
});
