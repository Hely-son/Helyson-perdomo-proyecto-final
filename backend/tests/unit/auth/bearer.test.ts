import { parseBearerToken } from '../../../src/middlewares/require-auth';

// TK-01.1 · D2: parseo de la cabecera Authorization (esquema Bearer, un solo token).

describe('TK-01.1 · parseBearerToken', () => {
  test('extrae el token de "Bearer <token>"', () => {
    expect(parseBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  test.each([
    ['ausente', undefined],
    ['vacía', ''],
    ['Bearer sin token', 'Bearer '],
    ['solo el token', 'abc.def.ghi'],
    ['esquema Basic', 'Basic abc'],
    ['esquema Token', 'Token abc.def.ghi'],
    ['minúsculas', 'bearer abc.def.ghi'],
    ['dos tokens', 'Bearer a b'],
    ['espacios dobles', 'Bearer  abc'],
  ])('devuelve null con cabecera %s', (_label, header) => {
    expect(parseBearerToken(header)).toBeNull();
  });
});
