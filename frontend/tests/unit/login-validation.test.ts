import { validateLoginInput } from '../../src/auth/login-validation';

// TK-01.2 · spec 05 §16.3 ("Error de validación local"), §15.2 paso 2; ESC-35 (U). Matriz: docs/qa/TK-01.2-matrix.md.
// Devuelve un objeto con un mensaje por campo inválido; {} si ambos son válidos. Los textos no se fijan aquí.

const VALID = { email: 'operador@medsupply.test', password: 'secreto' };

describe('QA-01.2-14 (ESC-35 U): validateLoginInput', () => {
  it('email con formato y contraseña no vacía → sin errores', () => {
    expect(validateLoginInput(VALID)).toEqual({});
  });

  it('email en mayúsculas sigue siendo válido (la comparación en minúsculas es del backend)', () => {
    expect(validateLoginInput({ ...VALID, email: 'OPERADOR@MEDSUPPLY.TEST' })).toEqual({});
  });

  it('email vacío → error solo en email', () => {
    const errors = validateLoginInput({ ...VALID, email: '' });
    expect(typeof errors.email).toBe('string');
    expect(errors.email).not.toBe('');
    expect(errors.password).toBeUndefined();
  });

  it('contraseña vacía → error solo en contraseña', () => {
    const errors = validateLoginInput({ ...VALID, password: '' });
    expect(typeof errors.password).toBe('string');
    expect(errors.password).not.toBe('');
    expect(errors.email).toBeUndefined();
  });

  it('ambos vacíos → error en los dos campos', () => {
    const errors = validateLoginInput({ email: '', password: '' });
    expect(typeof errors.email).toBe('string');
    expect(typeof errors.password).toBe('string');
  });

  it.each(['operador', 'operador@', '@medsupply.test', 'operador medsupply.test', '   '])(
    'email sin formato (%j) → error en email',
    (email) => {
      const errors = validateLoginInput({ ...VALID, email });
      expect(typeof errors.email).toBe('string');
      expect(errors.email).not.toBe('');
      expect(errors.password).toBeUndefined();
    },
  );
});
