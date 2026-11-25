import bcrypt from 'bcryptjs';
import { createAuthService } from '../../../src/modules/auth/auth.service';
import { DUMMY_PASSWORD_HASH, hashPassword } from '../../../src/modules/auth/password';
import { AppError } from '../../../src/lib/app-error';
import { QA_JWT_SECRET } from '../../helpers/jwt';

// TK-01.1 · D3 y búsqueda del operador en minúsculas, con un cliente de base de datos falso.

function buildService(user: { id: number; email: string; name: string; passwordHash: string } | null) {
  const findUnique = jest.fn().mockResolvedValue(user);
  const service = createAuthService({
    prisma: { user: { findUnique } },
    auth: { jwtSecret: QA_JWT_SECRET, jwtExpiresIn: '8h' },
  });
  return { service, findUnique };
}

afterEach(() => jest.restoreAllMocks());

describe('TK-01.1 · auth.service login', () => {
  test('email inexistente: compara contra DUMMY_PASSWORD_HASH y responde 401 INVALID_CREDENTIALS', async () => {
    const spy = jest.spyOn(bcrypt, 'compare');
    const { service } = buildService(null);
    const err = await service.login({ email: 'nadie@example.test', password: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos.' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toBe(DUMMY_PASSWORD_HASH);
  });

  test('contraseña incorrecta: mismo error', async () => {
    const hash = await hashPassword('correcta');
    const { service } = buildService({ id: 1, email: 'a@example.test', name: 'A', passwordHash: hash });
    await expect(service.login({ email: 'a@example.test', password: 'mala' })).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Email o contraseña incorrectos.',
    });
  });

  test('busca el email en minúsculas y devuelve solo {id, email, name} del operador', async () => {
    const hash = await hashPassword('correcta');
    const { service, findUnique } = buildService({ id: 3, email: 'a@example.test', name: 'A', passwordHash: hash });
    const res = await service.login({ email: 'A@Example.TEST', password: 'correcta' });
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'a@example.test' } });
    expect(res.operator).toEqual({ id: 3, email: 'a@example.test', name: 'A' });
    expect(res.tokenType).toBe('Bearer');
    expect(Object.keys(res).sort()).toEqual(['expiresAt', 'operator', 'token', 'tokenType']);
  });
});
