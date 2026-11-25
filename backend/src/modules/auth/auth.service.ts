import bcrypt from 'bcryptjs';
import { AppError } from '../../lib/app-error';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password';
import { signAccessToken, type AuthOptions } from './token';

// Login del operador (AU-01, spec 05 §15.2). Un email inexistente y una contraseña incorrecta dan el mismo 401 (RNF-08).

export interface LoginInput {
  email: string;
  password: string;
}

export interface Operator {
  id: number;
  email: string;
  name: string;
}

export interface LoginResult {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
  operator: Operator;
}

/** Lo único que el servicio necesita del cliente de base de datos; el PrismaClient lo cumple. */
export interface AuthDb {
  user: {
    findUnique(args: { where: { email: string } }): Promise<(Operator & { passwordHash: string }) | null>;
  };
}

export interface AuthService {
  login(input: LoginInput): Promise<LoginResult>;
}

const INVALID_CREDENTIALS = 'Email o contraseña incorrectos.';

export function createAuthService(deps: { prisma: AuthDb; auth: AuthOptions }): AuthService {
  return {
    async login({ email, password }) {
      const user = await deps.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (user === null) {
        await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
        throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
      }
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
      }
      const { token, expiresAt } = signAccessToken(user.id, deps.auth);
      return {
        token,
        tokenType: 'Bearer',
        expiresAt,
        operator: { id: user.id, email: user.email, name: user.name },
      };
    },
  };
}
