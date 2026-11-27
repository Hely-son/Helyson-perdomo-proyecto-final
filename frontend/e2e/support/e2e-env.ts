// Datos del entorno E2E (TK-01.2, D2, D3, D6). Matriz: docs/qa/TK-01.2-matrix.md.
// El secreto JWT y la contraseña del operador E2E los genera playwright.config.ts por ejecución y llegan
// a los workers por el entorno. Nunca se imprimen: las aserciones sobre ellos comparan booleanos.

/** Operador ficticio, exclusivo de E2E en medsupply_test (dominio reservado .test). No es el del seed. */
export const E2E_OPERATOR_EMAIL = 'operador.e2e@medsupply.test';
/** Nombre ficticio conocido: el layout debe mostrarlo junto a "Cerrar sesión" (ESC-50). */
export const E2E_OPERATOR_NAME = 'Operadora E2E Ficticia';

/**
 * Cliente ficticio y activo del simulador de chat (TK-05.4, D2), exclusivo de E2E en medsupply_test.
 * Lo prepara e2e/global-setup.ts con backend/tests/e2e-support/upsert-e2e-chat-customer.ts. No es del seed.
 * Se escribe con los nueve dígitos nacionales (lo que envía el simulador); en la base se guarda normalizado (+56…).
 */
export const E2E_CHAT_CUSTOMER_NAME = 'Clínica E2E Ficticia';
export const E2E_CHAT_CUSTOMER_TAX_ID = 'QA-E2E-CHAT-01';
export const E2E_CHAT_CUSTOMER_NATIONAL_PHONE = '955500123';
export const E2E_CHAT_CUSTOMER_PHONE = `+56${E2E_CHAT_CUSTOMER_NATIONAL_PHONE}`;

/** Backend de E2E (sin pasar por el proxy de Vite). */
export const BACKEND_URL = 'http://127.0.0.1:3100';

/** Clave y formato JSON { token, expiresAt, operatorName } de la sesión guardada (fijados en QA-01.2-03). */
export const SESSION_STORAGE_KEY = 'medsupply.session';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`E2E: falta ${name} en el entorno (la genera playwright.config.ts)`);
  return value;
}

export function e2eOperatorPassword(): string {
  return required('MEDSUPPLY_E2E_OPERATOR_PASSWORD');
}

export function e2eJwtSecret(): string {
  return required('MEDSUPPLY_E2E_JWT_SECRET');
}
