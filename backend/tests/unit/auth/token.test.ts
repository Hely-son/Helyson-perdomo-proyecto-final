import { signAccessToken, verifyAccessToken } from '../../../src/modules/auth/token';
import { decodeJwt, nowSeconds, QA_JWT_SECRET, QA_OTHER_SECRET, signTestJwt, verifiesWith } from '../../helpers/jwt';

// TK-01.1 · D1: JWT HS256 con payload exacto { sub, iat, exp } y verificación restringida a HS256.

const OPTS = { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' };

describe('TK-01.1 · token de acceso', () => {
  test('firma HS256 con payload exacto {sub (cadena), iat, exp} y expiresAt = exp * 1000', () => {
    const { token, expiresAt } = signAccessToken(42, OPTS);
    const { header, payload } = decodeJwt(token);
    expect(header.alg).toBe('HS256');
    expect(verifiesWith(token, QA_JWT_SECRET)).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']);
    expect(payload.sub).toBe('42');
    expect((payload.exp as number) - (payload.iat as number)).toBe(8 * 3600);
    expect(expiresAt).toBe(new Date((payload.exp as number) * 1000).toISOString());
  });

  test('verifica un token propio y devuelve el sub', () => {
    const { token } = signAccessToken(7, OPTS);
    expect(verifyAccessToken(token, QA_JWT_SECRET)).toEqual({ sub: '7' });
  });

  test('rechaza firma con otro secreto', () => {
    const { token } = signAccessToken(7, OPTS);
    expect(verifyAccessToken(token, QA_OTHER_SECRET)).toBeNull();
  });

  test('rechaza payload alterado con la firma original', () => {
    const [h, , s] = signAccessToken(7, OPTS).token.split('.');
    const now = nowSeconds();
    const body = Buffer.from(JSON.stringify({ sub: '1', iat: now, exp: now + 3600 })).toString('base64url');
    expect(verifyAccessToken(`${h}.${body}.${s}`, QA_JWT_SECRET)).toBeNull();
  });

  test('rechaza alg none y otro algoritmo HMAC', () => {
    const now = nowSeconds();
    const payload = { sub: '1', iat: now, exp: now + 3600 };
    expect(verifyAccessToken(signTestJwt(payload, { alg: 'none' }), QA_JWT_SECRET)).toBeNull();
    expect(verifyAccessToken(signTestJwt(payload, { alg: 'HS512' }), QA_JWT_SECRET)).toBeNull();
  });

  test('rechaza un token expirado', () => {
    const now = nowSeconds();
    const token = signTestJwt({ sub: '1', iat: now - 7200, exp: now - 60 });
    expect(verifyAccessToken(token, QA_JWT_SECRET)).toBeNull();
  });

  test('rechaza cadenas que no son JWT y tokens sin sub cadena', () => {
    expect(verifyAccessToken('no-es-un-jwt', QA_JWT_SECRET)).toBeNull();
    const now = nowSeconds();
    expect(verifyAccessToken(signTestJwt({ iat: now, exp: now + 60 }), QA_JWT_SECRET)).toBeNull();
    expect(verifyAccessToken(signTestJwt({ sub: 1, iat: now, exp: now + 60 }), QA_JWT_SECRET)).toBeNull();
  });

  test('rechaza un token HS256 firmado con el secreto correcto pero sin exp (AU-03)', () => {
    const now = nowSeconds();
    expect(verifyAccessToken(signTestJwt({ sub: '1', iat: now }), QA_JWT_SECRET)).toBeNull();
  });
});
