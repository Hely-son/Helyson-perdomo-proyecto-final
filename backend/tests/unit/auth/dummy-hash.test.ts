import bcrypt from 'bcryptjs';
import { BCRYPT_COST, DUMMY_PASSWORD_HASH } from '../../../src/modules/auth/password';

// TK-01.1 · decisión D3 de la puerta 1 (RNF-08, ESC-25): con un email inexistente el login compara igualmente
// contra un hash bcrypt ficticio FIJO (constante del módulo auth, no generado por petición) con costo BCRYPT_COST.
// La verificación determinista de que se usa (spy) es prueba técnica del backend. Escenarios: docs/qa/TK-01.1-matrix.md.

describe('TK-01.1 · D3 hash ficticio para emails inexistentes', () => {
  test('D3 DUMMY_PASSWORD_HASH es un hash bcrypt fijo con costo BCRYPT_COST', () => {
    expect(typeof DUMMY_PASSWORD_HASH).toBe('string');
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_COST);
  });
});
