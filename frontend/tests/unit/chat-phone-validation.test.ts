import { validateChatPhone } from '../../src/chat/phone';

// TK-05.4 · spec 05 §6.3 A y ESC-56 (U): validación local del teléfono del simulador (nueve dígitos nacionales).

describe('validateChatPhone (spec 05 §6.3 A)', () => {
  it('vacía → pide ingresar el número', () => {
    const r = validateChatPhone('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/ingres\w*[^.]*n[uú]mero/i);
  });

  it('solo espacios cuenta como vacía', () => {
    expect(validateChatPhone('   ').ok).toBe(false);
  });

  it('8 dígitos → "Falta 1 dígito"', () => {
    expect(validateChatPhone('94907687')).toEqual({ ok: false, message: 'Falta 1 dígito' });
  });

  it('7 dígitos → "Faltan 2 dígitos"', () => {
    expect(validateChatPhone('9490768')).toEqual({ ok: false, message: 'Faltan 2 dígitos' });
  });

  it('10 dígitos → sobran dígitos', () => {
    const r = validateChatPhone('9490768765');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/sobra/i);
  });

  it('9 dígitos → válido y devuelve solo los nueve dígitos', () => {
    expect(validateChatPhone('949076876')).toEqual({ ok: true, digits: '949076876' });
  });

  it('acepta separadores (espacios, guiones, puntos) y los descarta', () => {
    expect(validateChatPhone('9 4907-6876')).toEqual({ ok: true, digits: '949076876' });
    expect(validateChatPhone('949.076.876')).toEqual({ ok: true, digits: '949076876' });
  });

  it('caracteres no numéricos distintos de separadores → inválido', () => {
    expect(validateChatPhone('9490768ab').ok).toBe(false);
  });
});
