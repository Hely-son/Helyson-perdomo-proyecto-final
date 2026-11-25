// Sesión del operador (spec 05 §15.4, §15.7). Funciones puras: no decodifican el JWT; la autoridad es el backend.
export interface Session {
  token: string;
  /** Momento de expiración devuelto por `login` (ISO 8601). */
  expiresAt: string;
  operatorName: string;
}

/** Lee una sesión guardada. Devuelve null si falta, es ilegible o está incompleta. Una sesión vencida se lee igual. */
export function parseStoredSession(raw: string | null): Session | null {
  if (raw === null || raw === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { token, expiresAt, operatorName } = value as Record<string, unknown>;
  if (typeof token !== 'string' || token === '') return null;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return null;
  if (typeof operatorName !== 'string') return null;
  return { token, expiresAt, operatorName };
}

/** Vigente solo si `expiresAt` es posterior a `now` (ms). Ayuda de UX, no frontera de seguridad (§15.4). */
export function isSessionValid(session: Session | null, now: number): boolean {
  if (session === null) return false;
  const expires = Date.parse(session.expiresAt);
  return !Number.isNaN(expires) && expires > now;
}
