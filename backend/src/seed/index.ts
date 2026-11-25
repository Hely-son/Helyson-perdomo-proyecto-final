import { createPrismaClient } from '../lib/prisma';
import { parseSeedConfig, SeedConfigError, type SeedConfig } from './config';
import { DEFAULT_SEED_FIXTURES } from './fixtures';
import { runSeed, SeedConflictError } from './seed';

// Punto de entrada del seed (TK-00.4). Salida 0 en éxito (incluidas omisiones) y 1 ante cualquier fallo.
// Nunca imprime err.message de Prisma, la URL, teléfonos, contraseña ni hash (RNF-08, DP-08).

const log = (message: string): void => console.log(`[seed] ${message}`);
const logError = (message: string): void => console.error(`[seed] ERROR: ${message}`);

async function main(): Promise<number> {
  let config: SeedConfig;
  try {
    config = parseSeedConfig(process.env);
  } catch (err) {
    if (err instanceof SeedConfigError) logError(err.message);
    else logError('No se pudo leer la configuración del seed.');
    return 1;
  }

  const prisma = createPrismaClient(config.databaseUrl);
  try {
    const summary = await runSeed(prisma, config.operator, DEFAULT_SEED_FIXTURES, log);
    log(`Resumen: ${JSON.stringify(summary)}`);
    return 0;
  } catch (err) {
    if (err instanceof SeedConflictError) {
      logError(err.message);
    } else {
      const code = typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? ` (código ${err.code})` : '';
      logError(`El seed falló${code}.`);
    }
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    logError('Fallo inesperado.');
    process.exitCode = 1;
  },
);
