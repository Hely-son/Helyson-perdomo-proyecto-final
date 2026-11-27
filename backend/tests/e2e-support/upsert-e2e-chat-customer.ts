import { createPrismaClient } from '../../src/lib/prisma';

// Cliente ficticio de E2E del simulador de chat (TK-05.4, D2). Lo ejecuta una vez por corrida el globalSetup de
// Playwright (frontend/e2e/global-setup.ts) con tsx, igual que upsert-e2e-operator.ts. Fuera de tsconfig.build.json y
// de .dockerignore: no llega a dist/ ni a la imagen. No ejecuta el seed y no borra nada: solo crea o actualiza la
// fila identificada por E2E_CHAT_CUSTOMER_TAX_ID, que queda activa (si un test la desactivara, la corrida siguiente la restablece).
//
// Entradas, solo por entorno: DATABASE_URL, E2E_CHAT_CUSTOMER_NAME, E2E_CHAT_CUSTOMER_TAX_ID, E2E_CHAT_CUSTOMER_PHONE.
// Los mensajes son fijos: nunca incluyen la URL, el nombre, el identificador fiscal ni el teléfono.

const TEST_DATABASE = 'medsupply_test';
const log = (message: string): void => console.log(`[e2e-chat-customer] ${message}`);
const logError = (message: string): void => console.error(`[e2e-chat-customer] ERROR: ${message}`);

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

/** Identificador fiscal ficticio de E2E: el prefijo obligatorio impide tocar un cliente del seed o de otra prueba. */
function isE2ETaxId(value: string | undefined): value is string {
  return typeof value === 'string' && /^QA-E2E-[A-Z0-9-]+$/.test(value);
}

/** Teléfono ya normalizado (RN-12): +56 y nueve dígitos. */
function isNormalizedPhone(value: string | undefined): value is string {
  return typeof value === 'string' && /^\+56\d{9}$/.test(value);
}

async function main(): Promise<number> {
  const { DATABASE_URL, E2E_CHAT_CUSTOMER_NAME, E2E_CHAT_CUSTOMER_TAX_ID, E2E_CHAT_CUSTOMER_PHONE } = process.env;
  if (!targetsTestDatabase(DATABASE_URL)) {
    logError('la base destino no es medsupply_test; no se conecta ni se escribe nada.');
    return 1;
  }
  if (!E2E_CHAT_CUSTOMER_NAME?.trim() || !isE2ETaxId(E2E_CHAT_CUSTOMER_TAX_ID) || !isNormalizedPhone(E2E_CHAT_CUSTOMER_PHONE)) {
    logError('faltan o son inválidas las variables del cliente E2E; no se conecta ni se escribe nada.');
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
    // Si otro cliente (de otra prueba) ya usa este teléfono, no se toca: se informa y se falla.
    const holder = await prisma.customer.findUnique({ where: { phone: E2E_CHAT_CUSTOMER_PHONE } });
    if (holder !== null && holder.taxId !== E2E_CHAT_CUSTOMER_TAX_ID) {
      logError('el teléfono del cliente E2E ya pertenece a otro cliente; no se escribe nada.');
      return 1;
    }
    await prisma.customer.upsert({
      where: { taxId: E2E_CHAT_CUSTOMER_TAX_ID },
      create: { businessName: E2E_CHAT_CUSTOMER_NAME, taxId: E2E_CHAT_CUSTOMER_TAX_ID, phone: E2E_CHAT_CUSTOMER_PHONE, isActive: true },
      update: { businessName: E2E_CHAT_CUSTOMER_NAME, phone: E2E_CHAT_CUSTOMER_PHONE, isActive: true },
    });
    log('Cliente E2E del chat preparado en medsupply_test.');
    return 0;
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string' ? ` (código ${err.code})` : '';
    logError(`no se pudo preparar el cliente E2E${code}.`);
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
