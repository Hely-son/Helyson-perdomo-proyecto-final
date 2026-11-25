import { createHmac } from 'node:crypto';

// Utilidad de pruebas (TK-01.1): firma y decodifica JWT con node:crypto, sin depender de la biblioteca
// que use la implementación. Solo para construir tokens válidos, expirados, manipulados o con `alg` ajeno.
// Los secretos de prueba son ficticios; nunca se imprimen tokens.

export const QA_JWT_SECRET = 'qa-tk011-secreto-ficticio-solo-pruebas-0123456789';
export const QA_OTHER_SECRET = 'qa-tk011-otro-secreto-ficticio-distinto-9876543210';

const HMAC_BY_ALG: Record<string, string> = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

export interface SignOptions {
  /** Algoritmo declarado en la cabecera. `none` produce un token sin firma. */
  alg?: 'HS256' | 'HS384' | 'HS512' | 'none';
  secret?: string;
}

/** Firma un JWT con la cabecera y el payload dados (por defecto HS256 con QA_JWT_SECRET). */
export function signTestJwt(payload: Record<string, unknown>, options: SignOptions = {}): string {
  const alg = options.alg ?? 'HS256';
  const head = b64url(JSON.stringify({ alg, typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  if (alg === 'none') return `${head}.${body}.`;
  const signature = createHmac(HMAC_BY_ALG[alg], options.secret ?? QA_JWT_SECRET)
    .update(`${head}.${body}`)
    .digest('base64url');
  return `${head}.${body}.${signature}`;
}

/** Segundos Unix actuales. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Token HS256 vigente (1 h) con el payload mínimo de D1 (sub, iat, exp). `sub` como cadena (RFC 7519 §4.1.2). */
export function validTestToken(sub: string = '1', secret: string = QA_JWT_SECRET): string {
  const iat = nowSeconds();
  return signTestJwt({ sub, iat, exp: iat + 3600 }, { secret });
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: string;
}

/** Decodifica sin verificar (la verificación de la firma la hace el test con verifiesWith). */
export function decodeJwt(token: string): DecodedJwt {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('El token no tiene tres partes');
  const [head, body, signature] = parts;
  return {
    header: JSON.parse(Buffer.from(head, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(body, 'base64url').toString('utf8')),
    signingInput: `${head}.${body}`,
    signature,
  };
}

/** true si la firma HS256 del token corresponde a `secret`. */
export function verifiesWith(token: string, secret: string): boolean {
  const { signingInput, signature } = decodeJwt(token);
  return createHmac('sha256', secret).update(signingInput).digest('base64url') === signature;
}
