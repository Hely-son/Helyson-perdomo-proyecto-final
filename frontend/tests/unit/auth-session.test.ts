import { isSessionValid, parseStoredSession, type Session } from '../../src/auth/session';

// TK-01.2 · spec 05 §15.4 (DP-05), §15.7, §16.2. Matriz: docs/qa/TK-01.2-matrix.md.
// La sesión es { token, expiresAt, operatorName }. No se decodifica ni se valida el JWT en el cliente:
// la autoridad es el backend (§15.4); solo se compara expiresAt con la hora actual.

const NOW = Date.parse('2026-11-24T12:00:00.000Z');

const session: Session = {
  token: 'no-es-un-jwt-y-no-importa',
  expiresAt: '2026-11-24T20:00:00.000Z',
  operatorName: 'Operadora de Prueba',
};

describe('QA-01.2-01 (§15.7, DP-09): parseStoredSession lee la sesión guardada', () => {
  it('un JSON con token, expiresAt y operatorName devuelve la sesión', () => {
    expect(parseStoredSession(JSON.stringify(session))).toEqual(session);
  });

  it('no decodifica el JWT: un token que no es JWT se acepta igual', () => {
    expect(parseStoredSession(JSON.stringify({ ...session, token: 'x' }))?.token).toBe('x');
  });

  it('una sesión ya vencida se lee igual (la vigencia la decide isSessionValid)', () => {
    const expired = { ...session, expiresAt: '2000-01-01T00:00:00.000Z' };
    expect(parseStoredSession(JSON.stringify(expired))).toEqual(expired);
  });

  it.each([
    ['null (no hay nada guardado)', null],
    ['cadena vacía', ''],
    ['JSON inválido', '{token:'],
    ['JSON que no es objeto', '"texto"'],
    ['arreglo', '[]'],
    ['JSON null', 'null'],
    ['sin token', JSON.stringify({ expiresAt: session.expiresAt, operatorName: session.operatorName })],
    ['sin expiresAt', JSON.stringify({ token: session.token, operatorName: session.operatorName })],
    ['sin operatorName', JSON.stringify({ token: session.token, expiresAt: session.expiresAt })],
    ['token vacío', JSON.stringify({ ...session, token: '' })],
    ['token no string', JSON.stringify({ ...session, token: 123 })],
    ['expiresAt no string', JSON.stringify({ ...session, expiresAt: 1764000000000 })],
    ['expiresAt ilegible', JSON.stringify({ ...session, expiresAt: 'mañana' })],
    ['operatorName no string', JSON.stringify({ ...session, operatorName: null })],
  ])('valor corrupto o incompleto (%s) → null', (_caso, raw) => {
    expect(parseStoredSession(raw)).toBeNull();
  });
});

describe('QA-01.2-02 (DP-05, ESC-46/ESC-48 lógica): isSessionValid compara expiresAt con la hora actual', () => {
  it('sin sesión no hay sesión válida', () => {
    expect(isSessionValid(null, NOW)).toBe(false);
  });

  it('expiresAt posterior a ahora → válida', () => {
    expect(isSessionValid(session, NOW)).toBe(true);
    expect(isSessionValid({ ...session, expiresAt: new Date(NOW + 1).toISOString() }, NOW)).toBe(true);
  });

  it('expiresAt igual a ahora → vencida (válida solo si expiresAt > ahora)', () => {
    expect(isSessionValid({ ...session, expiresAt: new Date(NOW).toISOString() }, NOW)).toBe(false);
  });

  it('expiresAt anterior a ahora → vencida', () => {
    expect(isSessionValid({ ...session, expiresAt: new Date(NOW - 1).toISOString() }, NOW)).toBe(false);
  });

  it('expiresAt ilegible → no válida', () => {
    expect(isSessionValid({ ...session, expiresAt: 'no-es-fecha' }, NOW)).toBe(false);
  });
});
