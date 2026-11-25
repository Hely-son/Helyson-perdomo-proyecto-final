import { normalizePhone } from '../../../src/modules/customers/phone-normalization';

// TK-02.4 · spec 05 §6.1, §6.2 y §11.1 (ESC-01..ESC-08, ESC-21).
const ok = (phone: string) => ({ ok: true, phone });
const bad = (reason: object) => ({ ok: false, reason });

describe('TK-02.4 · normalizePhone (RN-12)', () => {
  test('QA-02.4-01 ESC-01 nueve dígitos nacionales reciben +56', () => {
    expect(normalizePhone('912345678')).toEqual(ok('+56912345678'));
    expect(normalizePhone('949076876')).toEqual(ok('+56949076876'));
  });

  test('QA-02.4-02 ESC-02 +56 explícito no se duplica', () => {
    expect(normalizePhone('+56912345678')).toEqual(ok('+56912345678'));
    expect(normalizePhone('+56 9 1234 5678')).toEqual(ok('+56912345678'));
  });

  test('QA-02.4-03 ESC-03 otro prefijo internacional se conserva', () => {
    expect(normalizePhone('+54 9 11 1234 5678')).toEqual(ok('+5491112345678'));
    expect(normalizePhone('+14155552671')).toEqual(ok('+14155552671'));
  });

  test('QA-02.4-04 ESC-04 separadores aprobados: espacio, guion, punto y paréntesis', () => {
    expect(normalizePhone('9 4907-6876')).toEqual(ok('+56949076876'));
    expect(normalizePhone('(9) 4907.6876')).toEqual(ok('+56949076876'));
    expect(normalizePhone('9 1234 5678')).toEqual(ok('+56912345678'));
    expect(normalizePhone('+56 (9) 1234-5678')).toEqual(ok('+56912345678'));
  });

  test.each(['9490768765', '56949076876', '0056949076876'])('QA-02.4-05 ESC-05 %s sobran dígitos', (input) => {
    expect(normalizePhone(input)).toEqual(bad({ code: 'extra_digits' }));
  });

  test.each(['', '   '])('QA-02.4-06 ESC-06 %j es vacía', (input) => {
    expect(normalizePhone(input)).toEqual(bad({ code: 'empty' }));
  });

  test.each(['abc', '+', '9/4907/6876', '56+949076876', '\t', '9 4907 6876', '+ -'])(
    'QA-02.4-07 ESC-07 %j formato no admitido',
    (input) => {
      expect(normalizePhone(input)).toEqual(bad({ code: 'unsupported_format' }));
    },
  );

  test('QA-02.4-08 ESC-21 cuántos dígitos faltan; nunca se completan', () => {
    expect(normalizePhone('94907687')).toEqual(bad({ code: 'missing_digits', missing: 1 }));
    expect(normalizePhone('9490768')).toEqual(bad({ code: 'missing_digits', missing: 2 }));
    expect(normalizePhone('949076')).toEqual(bad({ code: 'missing_digits', missing: 3 }));
    expect(normalizePhone('949076876')).toEqual(ok('+56949076876'));
  });

  test.each(['+56912345678', '+56949076876', '+5491112345678', '+14155552671'])(
    'QA-02.4-09 ESC-08 %s es idempotente y cumple ^\\+[0-9]+$',
    (value) => {
      const first = normalizePhone(value);
      expect(first).toEqual(ok(value));
      expect(value).toMatch(/^\+[0-9]+$/);
    },
  );

  test('QA-02.4-09 ESC-08 renormalizar la salida de cada entrada válida da el mismo valor', () => {
    for (const input of ['912345678', '+56 9 1234 5678', '(9) 4907.6876', '+54 9 11 1234 5678']) {
      const first = normalizePhone(input);
      if (!first.ok) throw new Error('se esperaba válido');
      expect(first.phone).toMatch(/^\+[0-9]+$/);
      expect(normalizePhone(first.phone)).toEqual(first);
    }
  });

  test('entrada muy larga se resuelve en tiempo lineal', () => {
    const start = Date.now();
    expect(normalizePhone('9'.repeat(100000))).toEqual(bad({ code: 'extra_digits' }));
    expect(normalizePhone(' -'.repeat(50000) + 'x')).toEqual(bad({ code: 'unsupported_format' }));
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
