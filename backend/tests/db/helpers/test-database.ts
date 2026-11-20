import { Client } from 'pg';

// Arnés mínimo de las pruebas de base de datos (TK-00.3, decisiones 4 y 15 de la puerta 1).
// Reglas: la URL de pruebas se deriva de DATABASE_URL; antes de cualquier operación destructiva
// (TRUNCATE, setval, ALTER SEQUENCE) se consulta current_database() y se aborta si no es
// exactamente medsupply_test. Ningún mensaje de error incluye la URL ni la contraseña.
// La recreación automática de la base es de TK-00.5: aquí no hay DROP ni CREATE DATABASE.

export const TEST_DATABASE_NAME = 'medsupply_test';

/** Error del arnés. Su mensaje nunca contiene la URL, el usuario ni la contraseña. */
export class TestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestDatabaseError';
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
 * Los errores de PostgreSQL (p. ej. 42P01 si aún no existe el esquema) se propagan sin modificar.
 */
export async function resetDatabase(client: Queryable): Promise<void> {
  await assertTestDatabase(client);
  await client.query('TRUNCATE TABLE order_items, orders, products, customers, users RESTART IDENTITY CASCADE');
  await client.query('ALTER SEQUENCE order_number_seq RESTART WITH 1');
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
