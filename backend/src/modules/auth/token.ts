import jwt from 'jsonwebtoken';

// JWT de acceso (TK-01.1, D1; spec 05 §15.4): HS256, payload exactamente { sub, iat, exp }, sin estado en el servidor.

export interface AuthOptions {
  jwtSecret: string;
  jwtExpiresIn: string;
}

export interface AccessToken {
  token: string;
  expiresAt: string;
}

export function signAccessToken(operatorId: number, options: AuthOptions): AccessToken {
  const token = jwt.sign({}, options.jwtSecret, {
    algorithm: 'HS256',
    subject: String(operatorId),
    expiresIn: options.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
  const { exp } = jwt.decode(token) as { exp: number };
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Devuelve el sub si el token es válido (firma HS256, vigencia); null en cualquier otro caso. */
export function verifyAccessToken(token: string, secret: string): { sub: string } | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
