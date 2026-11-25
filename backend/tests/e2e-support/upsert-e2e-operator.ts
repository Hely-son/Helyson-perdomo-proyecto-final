import { createPrismaClient } from '../../src/lib/prisma';
import { hashPassword } from '../../src/modules/auth/password';

// Operador E2E (TK-01.2, D2, D6). Lo ejecuta una vez por corrida el globalSetup de Playwright
// (frontend/e2e/global-setup.ts) con tsx. Fuera de tsconfig.build.json y de .dockerignore: no llega a dist/
// ni a la imagen. No ejecuta el seed general y solo toca la fila del email recibido.
//
// Entradas, solo por entorno: DATABASE_URL, E2E_OPERATOR_EMAIL, E2E_OPERATOR_NAME, E2E_OPERATOR_PASSWORD.
// Los mensajes son fijos: nunca incluyen la URL, el email, el nombre, la contraseña ni el hash.

const TEST_DATABASE = 'medsupply_test';
const log = (message: string): void => console.log(`[e2e-operator] ${message}`);
const logError = (message: string): void => console.error(`[e2e-operator] ERROR: ${message}`);

/** true solo si la URL apunta exactamente a medsupply_test. Se decide antes de conectarse. */
function targetsTestDatabase(raw: string | undefined): boolean {
  let url: URL;
  try {
    url = new URL(raw ?? '');
  } catch {
    return false;
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return false;
  // pg acepta parámetros de consulta que podrían cambiar la base destino: se rechazan.
  for (const key of url.searchParams.keys()) {
    if (['database', 'dbname', 'db'].includes(key.toLowerCase())) return false;
  }
  try {
    return decodeURIComponent(url.pathname.slice(1)) === TEST_DATABASE;
  } catch {
    return false;
  }
}

/** Email ficticio de E2E: obligatorio el dominio reservado .test, para no tocar nunca al operador del seed. */
function isE2EEmail(value: string | undefined): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.test$/i.test(value);
}

async function main(): Promise<number> {
  const { DATABASE_URL, E2E_OPERATOR_EMAIL, E2E_OPERATOR_NAME, E2E_OPERATOR_PASSWORD } = process.env;
  if (!targetsTestDatabase(DATABASE_URL)) {
    logError('la base destino no es medsupply_test; no se conecta ni se escribe nada.');
    return 1;
  }
  if (!isE2EEmail(E2E_OPERATOR_EMAIL) || !E2E_OPERATOR_NAME?.trim() || !E2E_OPERATOR_PASSWORD) {
    logError('faltan o son inválidas las variables del operador E2E; no se conecta ni se escribe nada.');
    return 1;
  }

  const prisma = createPrismaClient(DATABASE_URL as string);
  try {
    // Segunda barrera, ya conectado y antes de escribir: la base real de la conexión.
    const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    if (row?.db !== TEST_DATABASE) {
      logError('la conexión no es medsupply_test; no se escribe nada.');
      return 1;
    }
    const email = E2E_OPERATOR_EMAIL.toLowerCase();
    const passwordHash = await hashPassword(E2E_OPERATOR_PASSWORD);
    await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, name: E2E_OPERATOR_NAME },
      update: { passwordHash, name: E2E_OPERATOR_NAME },
    });
    log('Operador E2E preparado en medsupply_test.');
    return 0;
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? ` (código ${err.code})` : '';
    logError(`no se pudo preparar el operador E2E${code}.`);
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
    logError('fallo inesperado.');
    process.exitCode = 1;
  },
);
