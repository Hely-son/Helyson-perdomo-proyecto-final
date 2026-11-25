import { ApiError } from '../../src/api/client';
import { isSessionLost } from '../../src/auth/errors';

// TK-01.2 · spec 05 §15.6 (D-07), §16.5 (D-09). Matriz: docs/qa/TK-01.2-matrix.md.
// Pérdida de sesión solo si la petición era protegida y el code es UNAUTHORIZED. Nada se decide por status ni por message.

describe('QA-01.2-08 (ESC-39 U, ESC-37 lógica; D-07): isSessionLost distingue por code', () => {
  it('UNAUTHORIZED en una petición protegida → pérdida de sesión', () => {
    expect(isSessionLost(new ApiError(401, 'UNAUTHORIZED', 'Sesión no válida o expirada.'), { auth: true })).toBe(true);
  });

  it('ESC-39: INVALID_CREDENTIALS en login (pública) → no es pérdida de sesión', () => {
    expect(isSessionLost(new ApiError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.'), { auth: false })).toBe(
      false,
    );
  });

  it('INVALID_CREDENTIALS no es pérdida de sesión ni siquiera en una petición protegida', () => {
    expect(isSessionLost(new ApiError(401, 'INVALID_CREDENTIALS', 'x'), { auth: true })).toBe(false);
  });

  it('UNAUTHORIZED en una petición pública → no es pérdida de sesión', () => {
    expect(isSessionLost(new ApiError(401, 'UNAUTHORIZED', 'x'), { auth: false })).toBe(false);
  });

  it('401 sin code (respuesta sin el formato Error) → no es pérdida de sesión', () => {
    expect(isSessionLost(new ApiError(401, null, 'Unauthorized'), { auth: true })).toBe(false);
  });

  it('el message no decide: 401 con otro code y message "UNAUTHORIZED" → no', () => {
    expect(isSessionLost(new ApiError(401, 'VALIDATION_ERROR', 'UNAUTHORIZED'), { auth: true })).toBe(false);
  });

  it.each([
    ['VALIDATION_ERROR', 422],
    ['MALFORMED_REQUEST', 400],
    ['INTERNAL_ERROR', 500],
    ['NOT_FOUND', 404],
    ['STOCK_CHANGED', 409],
  ])('%s (%i) en una petición protegida → no es pérdida de sesión (D-09)', (code, status) => {
    expect(isSessionLost(new ApiError(status, code, 'x'), { auth: true })).toBe(false);
  });

  it('fallo de red (status 0, sin code) → no', () => {
    expect(isSessionLost(new ApiError(0, null, 'No se pudo conectar con el servidor.'), { auth: true })).toBe(false);
  });

  it('un Error genérico con message "UNAUTHORIZED" → no', () => {
    expect(isSessionLost(new Error('UNAUTHORIZED'), { auth: true })).toBe(false);
  });
});
