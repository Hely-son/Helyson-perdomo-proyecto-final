import { z } from 'zod';

// Variables del seed (TK-00.4, plan N2; RNF-08; spec 05 §15.3, DP-08). No usa loadConfig ni exige JWT_SECRET.
// Los mensajes son fijos: nunca incluyen valores recibidos.

export interface SeedOperator {
  email: string;
  password: string;
  name: string;
}

export interface SeedConfig {
  databaseUrl: string;
  operator: SeedOperator;
}

export class SeedConfigError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    super(`Variables de entorno del seed inválidas o ausentes: ${variables.join(', ')}`);
    this.name = 'SeedConfigError';
    this.variables = variables;
  }
}

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  } catch {
    return false;
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().refine(isPostgresUrl),
  SEED_OPERATOR_EMAIL: z.email(),
  SEED_OPERATOR_PASSWORD: z.string().min(1),
  SEED_OPERATOR_NAME: z.string().refine((s) => s.trim() !== ''),
});

export function parseSeedConfig(env: NodeJS.ProcessEnv): SeedConfig {
  const result = envSchema.safeParse({
    DATABASE_URL: env.DATABASE_URL,
    SEED_OPERATOR_EMAIL: env.SEED_OPERATOR_EMAIL,
    SEED_OPERATOR_PASSWORD: env.SEED_OPERATOR_PASSWORD,
    SEED_OPERATOR_NAME: env.SEED_OPERATOR_NAME,
  });
  if (!result.success) {
    const names = new Set<string>();
    for (const issue of result.error.issues) names.add(String(issue.path[0]));
    throw new SeedConfigError([...names]);
  }
  const data = result.data;
  return {
    databaseUrl: data.DATABASE_URL,
    operator: { email: data.SEED_OPERATOR_EMAIL, password: data.SEED_OPERATOR_PASSWORD, name: data.SEED_OPERATOR_NAME },
  };
}
