// Normalización de teléfonos (RN-12; spec 05 §6.1, D-01..D-03). Función pura, sin acceso a la base.
// Recorrido lineal carácter a carácter: sin expresiones regulares, sin retroceso.

const NATIONAL_DIGITS = 9;
const NATIONAL_PREFIX = '+56';

/** Motivo interno del rechazo (spec 05 §6.3 B, D-04). No se expone al cliente del chat. */
export type PhoneRejection =
  | { code: 'empty' }
  | { code: 'missing_digits'; missing: number }
  | { code: 'extra_digits' }
  | { code: 'unsupported_format' };

export type PhoneNormalization = { ok: true; phone: string } | { ok: false; reason: PhoneRejection };

const reject = (reason: PhoneRejection): PhoneNormalization => ({ ok: false, reason });

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/** Separadores aprobados (DP-01): espacio ASCII, guion, punto y paréntesis. */
function isSeparator(ch: string): boolean {
  return ch === ' ' || ch === '-' || ch === '.' || ch === '(' || ch === ')';
}

export function normalizePhone(input: string): PhoneNormalization {
  // Paso 1: vacía = cadena vacía o solo espacios ASCII.
  let onlySpaces = true;
  for (const ch of input) {
    if (ch !== ' ') {
      onlySpaces = false;
      break;
    }
  }
  if (onlySpaces) return reject({ code: 'empty' });

  // Pasos 2 y 3: quitar separadores; solo dígitos y un '+' inicial (tras quitar separadores).
  let digits = '';
  let hasPlus = false;
  let first = true;
  for (const ch of input) {
    if (isSeparator(ch)) continue;
    if (isDigit(ch)) {
      digits += ch;
    } else if (ch === '+' && first) {
      hasPlus = true;
    } else {
      return reject({ code: 'unsupported_format' });
    }
    first = false;
  }

  // Paso 4: prefijo internacional explícito.
  if (hasPlus) {
    return digits === '' ? reject({ code: 'unsupported_format' }) : { ok: true, phone: `+${digits}` };
  }

  // Paso 5: número nacional de exactamente nueve dígitos.
  if (digits.length < NATIONAL_DIGITS) return reject({ code: 'missing_digits', missing: NATIONAL_DIGITS - digits.length });
  if (digits.length > NATIONAL_DIGITS) return reject({ code: 'extra_digits' });
  return { ok: true, phone: `${NATIONAL_PREFIX}${digits}` };
}
