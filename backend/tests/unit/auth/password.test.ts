import bcrypt from 'bcryptjs';
import { BCRYPT_COST, hashPassword } from '../../../src/modules/auth/password';

// TK-00.4 · costo de bcrypt en una constante del módulo auth (spec 05 §15.3, DP-08; ESC-32, ESC-51; plan N1, R4).
// Escenarios: docs/qa/TK-00.4-scenarios.md.

const PLAIN = 'Contraseña-Ficticia-QA-0042';

describe('TK-00.4 · módulo auth: hash de contraseñas', () => {
  test('QA-00.4-01 DP-08 BCRYPT_COST es el predeterminado de bcryptjs (10)', () => {
    expect(BCRYPT_COST).toBe(10);
  });

  test('QA-00.4-02 RNF-08 hashPassword produce un hash bcrypt con BCRYPT_COST, verificable, con sal y sin la contraseña', async () => {
    const hash = await hashPassword(PLAIN);
    expect(hash).toMatch(/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/);
    expect(bcrypt.getRounds(hash)).toBe(BCRYPT_COST);
    expect(hash).not.toContain(PLAIN);
    await expect(bcrypt.compare(PLAIN, hash)).resolves.toBe(true);
    await expect(bcrypt.compare(`${PLAIN}x`, hash)).resolves.toBe(false);

    const other = await hashPassword(PLAIN);
    expect(other).not.toBe(hash);
    await expect(bcrypt.compare(PLAIN, other)).resolves.toBe(true);
  });
});
