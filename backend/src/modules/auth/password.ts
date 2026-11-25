import bcrypt from 'bcryptjs';

// Hash de contraseñas (spec 05 §15.3, DP-08; RNF-08). Solo lo que necesita el seed (TK-00.4):
// la verificación y el login llegan con los tickets de autenticación.

/** Costo de bcrypt: el predeterminado de bcryptjs. */
export const BCRYPT_COST = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Hash bcrypt FIJO de un valor aleatorio descartado, con costo BCRYPT_COST (TK-01.1, D3). Con un email
 * inexistente el login compara contra él para igualar el tiempo de respuesta (RNF-08). No se genera por petición.
 */
export const DUMMY_PASSWORD_HASH = '$2b$10$50ZLi.Mwhq8Zmu7JVh.ULuzk83PyxsNFKRm5NzxAWSTQIyStdLkzm';

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
