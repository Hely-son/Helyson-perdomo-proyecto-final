import { hashPassword, verifyPassword } from '../../../src/modules/auth/password';

// TK-01.1 · verifyPassword (bcryptjs).

describe('TK-01.1 · verifyPassword', () => {
  test('true con la contraseña correcta, false con otra', async () => {
    const hash = await hashPassword('Clave-Ficticia-QA-1');
    await expect(verifyPassword('Clave-Ficticia-QA-1', hash)).resolves.toBe(true);
    await expect(verifyPassword('otra', hash)).resolves.toBe(false);
  });
});
