// Validación local del teléfono del simulador (spec 05 §6.3 A, ESC-56). Solo feedback de formato:
// la normalización y la identificación son del backend (RN-12).
export const PHONE_DIGITS = 9;

export type PhoneCheck = { ok: true; digits: string } | { ok: false; message: string };

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function validateChatPhone(input: string): PhoneCheck {
  const compact = input.replace(/[\s.-]/g, '');
  if (compact === '') return { ok: false, message: 'Ingresa tu número de teléfono.' };
  if (!/^\d+$/.test(compact)) return { ok: false, message: 'Usa solo dígitos en el teléfono.' };
  if (compact.length < PHONE_DIGITS) {
    const missing = PHONE_DIGITS - compact.length;
    return { ok: false, message: `${plural(missing, 'Falta', 'Faltan')} ${missing} ${plural(missing, 'dígito', 'dígitos')}` };
  }
  if (compact.length > PHONE_DIGITS) return { ok: false, message: 'Sobran dígitos: ingresa solo los 9 dígitos del número.' };
  return { ok: true, digits: compact };
}
