import { z } from 'zod';

// Configuración leída de variables de entorno (TK-00.1, "Decisiones de implementación"; RNF-08).

export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  chatSessionTtlMinutes: number;
}

const JWT_SECRET_MIN_BYTES = 32;
const OPTIONAL_VARS = ['PORT', 'JWT_EXPIRES_IN', 'CHAT_SESSION_TTL_MINUTES'] as const;

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

function integerInRange(name: string, min: number, max: number) {
  return z
    .string()
    .regex(/^\d+$/, `${name} debe ser un entero`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${name} debe estar entre ${min} y ${max}`);
}

// Los mensajes son fijos y nunca incluyen el valor recibido.
const envSchema = z.object({
  PORT: integerInRange('PORT', 1, 65535).default(3000),
  DATABASE_URL: z
    .string('DATABASE_URL es obligatoria')
    .refine(isPostgresUrl, 'DATABASE_URL debe usar el esquema postgres:// o postgresql://'),
  JWT_SECRET: z
    .string('JWT_SECRET es obligatoria')
    .refine(
      (s) => Buffer.byteLength(s, 'utf8') >= JWT_SECRET_MIN_BYTES,
      `JWT_SECRET debe tener al menos ${JWT_SECRET_MIN_BYTES} bytes UTF-8`,
    ),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^[1-9]\d*[smhd]$/, 'JWT_EXPIRES_IN debe ser un entero positivo seguido de s, m, h o d')
    .default('8h'),
  CHAT_SESSION_TTL_MINUTES: integerInRange('CHAT_SESSION_TTL_MINUTES', 1, Number.MAX_SAFE_INTEGER).default(30),
});

/** Error de configuración: nombra las variables inválidas y nunca contiene sus valores. */
export class ConfigError extends Error {
  readonly variables: readonly string[];

  constructor(variables: string[], reasons: string[]) {
    super(`Configuración inválida (${variables.join(', ')}): ${reasons.join('; ')}`);
    this.name = 'ConfigError';
    this.variables = variables;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const input: Record<string, string | undefined> = {
    PORT: env.PORT,
    DATABASE_URL: env.DATABASE_URL,
    JWT_SECRET: env.JWT_SECRET,
    JWT_EXPIRES_IN: env.JWT_EXPIRES_IN,
    CHAT_SESSION_TTL_MINUTES: env.CHAT_SESSION_TTL_MINUTES,
  };
  // A2: una opcional vacía cuenta como ausente. Una obligatoria vacía la rechaza su regla.
  for (const name of OPTIONAL_VARS) {
    if (input[name] === '') input[name] = undefined;
  }

  const result = envSchema.safeParse(input);
  if (!result.success) {
    // Solo se copian el nombre de la variable y el mensaje fijo: ni issues, ni cause, ni input.
    const variables: string[] = [];
    const reasons: string[] = [];
    for (const issue of result.error.issues) {
      const name = String(issue.path[0]);
      if (variables.includes(name)) continue;
      variables.push(name);
      reasons.push(issue.message);
    }
    throw new ConfigError(variables, reasons);
  }

  const data = result.data;
  return {
    port: data.PORT,
    databaseUrl: data.DATABASE_URL,
    jwtSecret: data.JWT_SECRET,
    jwtExpiresIn: data.JWT_EXPIRES_IN,
    chatSessionTtlMinutes: data.CHAT_SESSION_TTL_MINUTES,
  };
}
