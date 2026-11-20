import { inspect } from 'node:util';
import { Client } from 'pg';
import {
  connectTestDatabase,
  deriveTestDatabaseUrl,
  resetDatabase,
  TestDatabaseError,
  type Queryable,
} from './helpers/test-database';

// Pruebas de aceptación de TK-00.3 · guard del arnés (decisiones 4 y 15). Nivel U: no se conectan a ninguna base.

const PASSWORD = 'S3cretPw';
const URL_PATTERN = /postgres(ql)?:\/\//i;

/** Todo el texto observable de un error. */
function errorSurface(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return [err.message, err.stack ?? '', String(err), inspect(err, { depth: 5 }), JSON.stringify(err)].join('\n');
}

function captureSync(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('Se esperaba un error y no se lanzó');
}

async function captureAsync(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Se esperaba un rechazo y la promesa se resolvió');
}

/** Cliente falso: registra las sentencias y responde current_database() con el nombre indicado. */
function fakeClient(currentDatabase: string): Queryable & { statements: string[] } {
  const statements: string[] = [];
  return {
    statements,
    async query(text: string) {
      statements.push(text);
      if (/current_database\(\)/i.test(text)) return { rows: [{ name: currentDatabase }] };
      return { rows: [] };
    },
  };
}

const INVALID_URLS: Array<[string, string | undefined]> = [
  ['ausente', undefined],
  ['vacía', '   '],
  ['no es URL', 'esto no es una url'],
  ['esquema distinto de postgres', `mysql://qa_user:${PASSWORD}@127.0.0.1:3306/medsupply`],
  ['sin nombre de base', `postgresql://qa_user:${PASSWORD}@127.0.0.1:5432`],
  ['sin nombre de base (barra final)', `postgresql://qa_user:${PASSWORD}@127.0.0.1:5432/`],
];

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

/** Fija DATABASE_URL (o la elimina) para que el helper la lea por su camino real, el entorno. */
function setDatabaseUrl(url: string | undefined): void {
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
}

afterEach(() => {
  jest.restoreAllMocks();
  setDatabaseUrl(ORIGINAL_DATABASE_URL);
});

describe('TK-00.3 · guard del arnés de base de datos', () => {
  test('QA-00.3-01 deriva medsupply_test conservando host, puerto, usuario, contraseña y parámetros', () => {
    const derived = new URL(deriveTestDatabaseUrl(`postgresql://qa_user:${PASSWORD}@127.0.0.1:5432/medsupply?sslmode=disable`));

    expect(derived.protocol).toBe('postgresql:');
    expect(derived.hostname).toBe('127.0.0.1');
    expect(derived.port).toBe('5432');
    expect(derived.username).toBe('qa_user');
    expect(derived.password).toBe(PASSWORD);
    expect(derived.search).toBe('?sslmode=disable');
    expect(derived.pathname).toBe('/medsupply_test');
  });

  test('QA-00.3-01 la derivación es idempotente y acepta el esquema postgres://', () => {
    const already = `postgres://qa_user:${PASSWORD}@db:5432/medsupply_test`;

    expect(new URL(deriveTestDatabaseUrl(already)).pathname).toBe('/medsupply_test');
    expect(deriveTestDatabaseUrl(deriveTestDatabaseUrl(already))).toBe(deriveTestDatabaseUrl(already));
  });

  test.each(INVALID_URLS)('QA-00.3-02 DATABASE_URL %s: la derivación falla con error del arnés', (_case, url) => {
    setDatabaseUrl(url);

    const err = captureSync(() => deriveTestDatabaseUrl());

    expect(err).toBeInstanceOf(TestDatabaseError);
  });

  test.each(INVALID_URLS)('QA-00.3-02 DATABASE_URL %s: connectTestDatabase falla sin intentar conectar', async (_case, url) => {
    setDatabaseUrl(url);
    // Si el guard fallara, la conexión no debe llegar a ninguna base: connect queda sustituido.
    const connect = jest.spyOn(Client.prototype, 'connect').mockImplementation(async () => undefined);

    const err = await captureAsync(connectTestDatabase());

    expect(err).toBeInstanceOf(TestDatabaseError);
    expect(connect).not.toHaveBeenCalled();
  });

  test.each(INVALID_URLS)('QA-00.3-03 DATABASE_URL %s: el error no muestra la URL ni la contraseña', (_case, url) => {
    setDatabaseUrl(url);

    const surface = errorSurface(captureSync(() => deriveTestDatabaseUrl()));

    expect(surface).not.toContain(PASSWORD);
    expect(surface).not.toMatch(URL_PATTERN);
  });

  test('QA-00.3-03 un fallo de conexión no muestra la URL ni la contraseña', async () => {
    // Puerto 1 de localhost: no hay servidor, la conexión se rechaza sin llegar a ninguna base.
    const err = await captureAsync(connectTestDatabase(`postgresql://qa_user:${PASSWORD}@127.0.0.1:1/medsupply`));
    const surface = errorSurface(err);

    expect(err).toBeInstanceOf(TestDatabaseError);
    expect(surface).not.toContain(PASSWORD);
    expect(surface).not.toContain('qa_user');
    expect(surface).not.toMatch(URL_PATTERN);
  });

  test.each(['medsupply', 'postgres', 'MEDSUPPLY_TEST', 'medsupply_test_copy', ''])(
    'QA-00.3-04 resetDatabase aborta si current_database() es "%s" y no ejecuta ninguna operación destructiva',
    async (currentDatabase) => {
      const client = fakeClient(currentDatabase);

      const err = await captureAsync(resetDatabase(client));

      expect(err).toBeInstanceOf(TestDatabaseError);
      expect(errorSurface(err)).not.toMatch(URL_PATTERN);
      expect(client.statements).toHaveLength(1);
      expect(client.statements[0]).toMatch(/current_database\(\)/i);
      expect(client.statements.join('\n')).not.toMatch(/TRUNCATE|setval|ALTER\s+SEQUENCE/i);
    },
  );

  test('QA-00.3-04 resetDatabase comprueba current_database() antes de vaciar y reiniciar la secuencia', async () => {
    const client = fakeClient('medsupply_test');

    await resetDatabase(client);

    expect(client.statements[0]).toMatch(/current_database\(\)/i);
    expect(client.statements.slice(1).join('\n')).toMatch(/TRUNCATE/i);
    expect(client.statements.slice(1).join('\n')).toMatch(/order_number_seq/i);
  });

  test('QA-00.3-04 connectTestDatabase cierra la conexión y aborta si la base conectada no es medsupply_test', async () => {
    // La URL textual es válida: el guard debe confiar en current_database(), no en el texto.
    jest.spyOn(Client.prototype, 'connect').mockImplementation(async () => undefined);
    const query = jest
      .spyOn(Client.prototype as unknown as Queryable, 'query')
      .mockImplementation(async () => ({ rows: [{ name: 'medsupply' }] }));
    const end = jest.spyOn(Client.prototype, 'end').mockImplementation(async () => undefined);

    const err = await captureAsync(connectTestDatabase(`postgresql://qa_user:${PASSWORD}@127.0.0.1:5432/medsupply`));

    expect(err).toBeInstanceOf(TestDatabaseError);
    expect(errorSurface(err)).not.toContain(PASSWORD);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/current_database\(\)/i);
    expect(end).toHaveBeenCalled();
  });
});
