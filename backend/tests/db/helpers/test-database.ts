import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Client, Pool } from 'pg';

// Arnés mínimo de las pruebas de base de datos (TK-00.3, decisiones 4 y 15 de la puerta 1).
// Reglas: la URL de pruebas se deriva de DATABASE_URL; antes de cualquier operación destructiva
// (TRUNCATE, setval, ALTER SEQUENCE) se consulta current_database() y se aborta si no es
// exactamente medsupply_test. Ningún mensaje de error incluye la URL, el usuario ni la contraseña (el servidor y el puerto pueden aparecer).
// TK-00.5: recreateTestDatabase (DROP/CREATE DATABASE del literal medsupply_test desde la base de mantenimiento
// `postgres`, sin FORCE) y limpieza transaccional con un Client dedicado; la limpieza rechaza un Pool.

export const TEST_DATABASE_NAME = 'medsupply_test';

/** Error del arnés. Su mensaje nunca contiene la URL, el usuario ni la contraseña; el servidor y el puerto no son secretos y pueden aparecer. */
export class TestDatabaseError extends Error {
  /** SQLSTATE del error de PostgreSQL que lo originó, si lo hubo. */
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'TestDatabaseError';
    this.code = code;
  }
}

/** Lo mínimo que el arnés necesita de un cliente: permite sustituirlo por uno falso en las pruebas del guard. */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Devuelve DATABASE_URL con la base sustituida por medsupply_test; el resto de la URL no cambia. */
export function deriveTestDatabaseUrl(databaseUrl: string | undefined = process.env.DATABASE_URL): string {
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new TestDatabaseError('DATABASE_URL es obligatoria para las pruebas de base de datos');
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new TestDatabaseError('DATABASE_URL no es una URL válida');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new TestDatabaseError('DATABASE_URL debe usar el esquema postgres o postgresql');
  }
  if (url.hostname === '') {
    throw new TestDatabaseError('DATABASE_URL no indica el servidor');
  }
  if (databaseNameOf(url) === '') {
    throw new TestDatabaseError('DATABASE_URL no indica el nombre de la base');
  }
  url.pathname = `/${TEST_DATABASE_NAME}`;
  // Comprobación textual previa a la conexión (no sustituye a la de current_database()).
  if (databaseNameOf(url) !== TEST_DATABASE_NAME) {
    throw new TestDatabaseError(`La URL derivada no apunta a ${TEST_DATABASE_NAME}`);
  }
  return url.toString();
}

/** Aborta si la base conectada no es exactamente medsupply_test. */
export async function assertTestDatabase(client: Queryable): Promise<void> {
  const result = await client.query('SELECT current_database() AS name');
  const name = result.rows[0]?.name;
  if (name !== TEST_DATABASE_NAME) {
    throw new TestDatabaseError(`Operación abortada: la base conectada no es ${TEST_DATABASE_NAME}`);
  }
}

/** Conecta a medsupply_test con la URL derivada y comprueba current_database() antes de devolver el cliente. */
export async function connectTestDatabase(databaseUrl: string | undefined = process.env.DATABASE_URL): Promise<Client> {
  const connectionString = deriveTestDatabaseUrl(databaseUrl);
  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    await client.end().catch(() => undefined);
    throw new TestDatabaseError(`No se pudo conectar a ${TEST_DATABASE_NAME} (${errorCodeOf(err)})`);
  }
  try {
    await assertTestDatabase(client);
  } catch (err) {
    await client.end().catch(() => undefined);
    if (err instanceof TestDatabaseError) throw err;
    throw new TestDatabaseError(`No se pudo comprobar la base conectada (${errorCodeOf(err)})`);
  }
  return client;
}

/**
 * Vacía las tablas del MVP y reinicia order_number_seq, solo si la base conectada es medsupply_test.
 * Recibe un Client dedicado (no un Pool: las sentencias de una transacción deben usar una sola conexión).
 * current_database() se comprueba fuera de la transacción; después BEGIN, TRUNCATE, secuencia y COMMIT.
 * Si algo falla se hace ROLLBACK y se propaga el error original (p. ej. 42P01 si aún no existe el esquema).
 */
export async function resetDatabase(client: Queryable): Promise<void> {
  if (client instanceof Pool) {
    throw new TestDatabaseError('resetDatabase requiere un Client dedicado, no un Pool');
  }
  await assertTestDatabase(client);
  await client.query('BEGIN');
  try {
    await client.query('TRUNCATE TABLE order_items, orders, products, customers, users RESTART IDENTITY CASCADE');
    await client.query('ALTER SEQUENCE order_number_seq RESTART WITH 1');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

/** Pool del arnés de pruebas: admite varias conexiones simultáneas (D-3). Quien lo crea lo cierra con pool.end(). */
export function createTestPool(max = 5): Pool {
  return new Pool({ connectionString: deriveTestDatabaseUrl(), max });
}

// ---- Recreación de medsupply_test (TK-00.5, D-2, A3, A6, A7) ----

const MAINTENANCE_DATABASE_NAME = 'postgres';
const SQLSTATE_UNDEFINED_DATABASE = '3D000';
const SQLSTATE_OBJECT_IN_USE = '55006';
const BACKEND_ROOT = path.resolve(__dirname, '../../..');

export interface MaintenanceClient extends Queryable {
  end(): Promise<void>;
}

/** Dependencias sustituibles de recreateTestDatabase (las pruebas unitarias inyectan versiones falsas). */
export interface RecreateDeps {
  connect(url: string): Promise<MaintenanceClient>;
  migrate(testDatabaseUrl: string): void;
}

/** Misma URL que la de pruebas (servidor, puerto, usuario, contraseña, parámetros) apuntando a `postgres`. */
export function deriveMaintenanceUrl(testDatabaseUrl: string): string {
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${MAINTENANCE_DATABASE_NAME}`;
  if (databaseNameOf(url) !== MAINTENANCE_DATABASE_NAME) {
    throw new TestDatabaseError(`La URL de mantenimiento no apunta a ${MAINTENANCE_DATABASE_NAME}`);
  }
  return url.toString();
}

/**
 * `prisma migrate deploy` con el binario local. La URL viaja solo en el entorno del proceso hijo.
 * Si falla, lanza un error con el código de salida y la salida de prisma sin URL, usuario ni contraseña.
 */
export function runMigrateDeploy(testDatabaseUrl: string): void {
  const result = spawnSync(path.join(BACKEND_ROOT, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy'], {
    cwd: BACKEND_ROOT,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (result.status === 0) return;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`;
  throw migrateFailureError(testDatabaseUrl, result.status, output);
}

/**
 * Error de `prisma migrate deploy` con la salida original redactada: sin URL, usuario ni contraseña
 * (codificados y decodificados). Se conservan el código de salida, los códigos Pxxxx y el servidor, que no es secreto
 * y ayuda a diagnosticar. Un secreto de menos de 3 caracteres solo se redacta entre comillas o acentos graves,
 * porque sustituirlo en todo el texto destrozaría el mensaje.
 */
export function migrateFailureError(testDatabaseUrl: string, status: number | null, rawOutput: string): TestDatabaseError {
  let output = rawOutput.replace(/postgres(ql)?:\/\/\S+/gi, '<url>');
  let url: URL | undefined;
  try {
    url = new URL(testDatabaseUrl);
  } catch {
    url = undefined;
  }
  const secrets = new Set<string>();
  for (const raw of [url?.username ?? '', url?.password ?? '']) {
    secrets.add(raw);
    secrets.add(safeDecode(raw));
  }
  for (const secret of [...secrets].filter((s) => s !== '').sort((x, y) => y.length - x.length)) {
    if (secret.length >= 3) {
      output = output.split(secret).join('***');
    } else {
      for (const quote of ['`', '"', "'"]) output = output.split(`${quote}${secret}${quote}`).join(`${quote}***${quote}`);
    }
  }
  return new TestDatabaseError(`prisma migrate deploy falló (código ${status ?? 'sin código'})\n${output}`);
}

/** decodeURIComponent que no lanza: ante un % mal codificado devuelve el literal. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const defaultRecreateDeps: RecreateDeps = {
  async connect(url) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
    } catch (err) {
      await client.end().catch(() => undefined);
      throw new TestDatabaseError(`No se pudo conectar a la base de mantenimiento (${errorCodeOf(err)})`);
    }
    return client;
  },
  migrate: runMigrateDeploy,
};

/**
 * Recrea medsupply_test: comprueba la URL, se conecta a `postgres`, comprueba current_database(), ejecuta
 * DROP y CREATE DATABASE del literal medsupply_test (sin FORCE ni IF EXISTS) y aplica las migraciones.
 * Una base inexistente (3D000 en el DROP) se tolera; cualquier otro error (p. ej. 55006, base en uso) aborta
 * con un error controlado que no incluye la URL ni la contraseña. No termina conexiones ajenas.
 */
export async function recreateTestDatabase(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
  deps: RecreateDeps = defaultRecreateDeps,
): Promise<void> {
  const testUrl = deriveTestDatabaseUrl(databaseUrl);
  const maintenance = await deps.connect(deriveMaintenanceUrl(testUrl));
  try {
    const { rows } = await maintenance.query('SELECT current_database() AS name');
    if (rows[0]?.name !== MAINTENANCE_DATABASE_NAME) {
      throw new TestDatabaseError(`Operación abortada: la conexión de mantenimiento no está en ${MAINTENANCE_DATABASE_NAME}`);
    }
    try {
      await maintenance.query(`DROP DATABASE ${TEST_DATABASE_NAME}`);
    } catch (err) {
      if (errorCodeOf(err) !== SQLSTATE_UNDEFINED_DATABASE) {
        const code = errorCodeOf(err);
        const reason = code === SQLSTATE_OBJECT_IN_USE ? `${TEST_DATABASE_NAME} tiene conexiones abiertas` : 'DROP DATABASE falló';
        throw new TestDatabaseError(`${reason} (${code}); cierre las sesiones y reintente`, code);
      }
    }
    try {
      await maintenance.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
    } catch (err) {
      throw new TestDatabaseError(`CREATE DATABASE falló (${errorCodeOf(err)})`, errorCodeOf(err));
    }
  } finally {
    await maintenance.end().catch(() => undefined);
  }
  deps.migrate(testUrl);
}

function databaseNameOf(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

/** Solo el código del error (SQLSTATE o código de sistema), nunca su mensaje: puede contener datos de conexión. */
function errorCodeOf(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return 'sin código';
}
