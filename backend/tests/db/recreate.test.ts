import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import { Client } from 'pg';
import {
  connectTestDatabase,
  deriveMaintenanceUrl,
  deriveTestDatabaseUrl,
  defaultRecreateDeps,
  recreateTestDatabase,
  migrateFailureError,
  runMigrateDeploy,
  TestDatabaseError,
  type MaintenanceClient,
  type RecreateDeps,
} from './helpers/test-database';

// Pruebas de aceptación de TK-00.5 · recreación de medsupply_test (D-2, A3, A6, A7).
// Las unitarias usan un cliente de mantenimiento falso; las de integración, el PostgreSQL real.

const PASSWORD = 'S3cretPw';
const URL_PATTERN = /postgres(ql)?:\/\//i;
const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations');

function surface(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  return [err.message, err.stack ?? '', String(err), inspect(err, { depth: 5 }), JSON.stringify(err)].join('\n');
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Se esperaba un rechazo y la promesa se resolvió');
}

class PgLikeError extends Error {
  constructor(public code: string) {
    super(`fallo simulado ${code}`);
  }
}

/** Cliente de mantenimiento falso: registra sentencias; `failOn` simula un error de PostgreSQL. */
function fakeMaintenance(currentDatabase = 'postgres', failOn?: { pattern: RegExp; code: string }) {
  const statements: string[] = [];
  let ended = 0;
  const client: MaintenanceClient = {
    async query(text: string) {
      statements.push(text);
      if (/current_database\(\)/i.test(text)) return { rows: [{ name: currentDatabase }] };
      if (failOn?.pattern.test(text)) throw new PgLikeError(failOn.code);
      return { rows: [] };
    },
    async end() {
      ended += 1;
    },
  };
  return { client, statements, ended: () => ended };
}

function fakeDeps(maintenance: MaintenanceClient) {
  const connectedUrls: string[] = [];
  const migratedUrls: string[] = [];
  const deps: RecreateDeps = {
    async connect(url) {
      connectedUrls.push(url);
      return maintenance;
    },
    migrate(url) {
      migratedUrls.push(url);
    },
  };
  return { deps, connectedUrls, migratedUrls };
}

const VALID_URL = `postgresql://qa_user:${PASSWORD}@127.0.0.1:5432/medsupply?sslmode=disable`;

describe('TK-00.5 · recreación (unitarias, cliente falso)', () => {
  test('QA-00.5-03 la URL de mantenimiento conserva servidor, puerto, usuario, contraseña y parámetros', () => {
    const maintenance = new URL(deriveMaintenanceUrl(deriveTestDatabaseUrl(VALID_URL)));

    expect(maintenance.hostname).toBe('127.0.0.1');
    expect(maintenance.port).toBe('5432');
    expect(maintenance.username).toBe('qa_user');
    expect(maintenance.password).toBe(PASSWORD);
    expect(maintenance.search).toBe('?sslmode=disable');
    expect(maintenance.pathname).toBe('/postgres');
  });

  test('QA-00.5-03 aborta sin DROP si la conexión de mantenimiento no está en postgres', async () => {
    const maint = fakeMaintenance('medsupply');
    const { deps, migratedUrls } = fakeDeps(maint.client);

    const err = await capture(recreateTestDatabase(VALID_URL, deps));

    expect(err).toBeInstanceOf(TestDatabaseError);
    expect(maint.statements).toHaveLength(1);
    expect(maint.statements[0]).toMatch(/current_database\(\)/i);
    expect(maint.statements.join('\n')).not.toMatch(/DROP|CREATE/i);
    expect(maint.ended()).toBe(1);
    expect(migratedUrls).toHaveLength(0);
    expect(surface(err)).not.toContain(PASSWORD);
  });

  test.each([
    ['ausente', undefined],
    ['vacía', '  '],
    ['inválida', 'no es una url'],
    ['esquema mysql', `mysql://qa_user:${PASSWORD}@127.0.0.1:3306/medsupply`],
    ['sin base', `postgresql://qa_user:${PASSWORD}@127.0.0.1:5432`],
  ])('QA-00.5-06 DATABASE_URL %s: aborta antes de abrir cualquier conexión, sin URL ni contraseña', async (_c, url) => {
    const maint = fakeMaintenance();
    const { deps, connectedUrls, migratedUrls } = fakeDeps(maint.client);
    // Un argumento `undefined` activa el valor por defecto (DATABASE_URL del entorno): se simula la ausencia en el entorno.
    const original = process.env.DATABASE_URL;
    if (url === undefined) delete process.env.DATABASE_URL;

    let err: unknown;
    try {
      err = await capture(recreateTestDatabase(url, deps));
    } finally {
      if (original !== undefined) process.env.DATABASE_URL = original;
    }

    expect(err).toBeInstanceOf(TestDatabaseError);
    expect(connectedUrls).toHaveLength(0);
    expect(migratedUrls).toHaveLength(0);
    expect(maint.statements).toHaveLength(0);
    expect(surface(err)).not.toContain(PASSWORD);
    expect(surface(err)).not.toMatch(URL_PATTERN);
  });

  test('QA-00.5-06 el destino derivado es exactamente medsupply_test aunque DATABASE_URL apunte a otra base', async () => {
    const maint = fakeMaintenance();
    const { deps, connectedUrls, migratedUrls } = fakeDeps(maint.client);

    await recreateTestDatabase(`postgresql://qa_user:${PASSWORD}@127.0.0.1:5432/otra_base`, deps);

    expect(new URL(connectedUrls[0]).pathname).toBe('/postgres');
    expect(new URL(migratedUrls[0]).pathname).toBe('/medsupply_test');
  });

  test('QA-00.5-04 solo DROP y CREATE DATABASE del literal medsupply_test, sin FORCE, y migrate al final', async () => {
    const maint = fakeMaintenance();
    const { deps, migratedUrls } = fakeDeps(maint.client);

    await recreateTestDatabase(VALID_URL, deps);

    expect(maint.statements.map((s) => s.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringMatching(/current_database\(\)/i),
      'DROP DATABASE medsupply_test',
      'CREATE DATABASE medsupply_test',
    ]);
    expect(maint.statements.join('\n')).not.toMatch(/FORCE|IF EXISTS/i);
    expect(maint.ended()).toBe(1);
    expect(migratedUrls).toHaveLength(1);
  });

  test('QA-00.5-01 (A6) base inexistente (3D000): continúa con CREATE y migrate', async () => {
    const maint = fakeMaintenance('postgres', { pattern: /^DROP/, code: '3D000' });
    const { deps, migratedUrls } = fakeDeps(maint.client);

    await recreateTestDatabase(VALID_URL, deps);

    expect(maint.statements.some((s) => /^CREATE DATABASE medsupply_test$/.test(s))).toBe(true);
    expect(migratedUrls).toHaveLength(1);
  });

  test.each(['55006', '42501', '57P01'])(
    'QA-00.5-01 (A6) cualquier otro error del DROP (%s) se propaga: sin CREATE ni migrate',
    async (code) => {
      const maint = fakeMaintenance('postgres', { pattern: /^DROP/, code });
      const { deps, migratedUrls } = fakeDeps(maint.client);

      const err = await capture(recreateTestDatabase(VALID_URL, deps));

      expect(err).toBeInstanceOf(TestDatabaseError);
      expect((err as TestDatabaseError).code).toBe(code);
      expect(maint.statements.join('\n')).not.toMatch(/CREATE/i);
      expect(migratedUrls).toHaveLength(0);
      expect(maint.ended()).toBe(1);
      expect(surface(err)).not.toContain(PASSWORD);
      expect(surface(err)).not.toMatch(URL_PATTERN);
    },
  );

  test('QA-00.5-07 si migrate falla se conserva el error original y no se continúa', async () => {
    const maint = fakeMaintenance();
    const original = new TestDatabaseError('prisma migrate deploy falló (código 7)');
    const deps: RecreateDeps = {
      connect: async () => maint.client,
      migrate() {
        throw original;
      },
    };

    const err = await capture(recreateTestDatabase(VALID_URL, deps));

    expect(err).toBe(original);
  });

  test('QA-00.5-07 migrate real fallido (sin servidor) lanza error controlado sin contraseña ni URL', async () => {
    // Fallo inducido sin tocar las migraciones: el puerto 1 no tiene servidor, prisma no puede conectar.
    const err = await capture(Promise.resolve().then(() => runMigrateDeploy(`postgresql://qa_user:${PASSWORD}@127.0.0.1:1/medsupply_test`)));

    expect(err).toBeInstanceOf(TestDatabaseError);
    expect(surface(err)).not.toContain(PASSWORD);
    expect(surface(err)).toMatch(/código/);
  }, 60_000);

  test('QA-00.5-07 el fallo de migrate no expone usuario, contraseña ni URL y conserva código P1xxx y de salida', () => {
    const user = 'qa_usr@x';
    const pw = 'p@ss w0rd';
    const encoded = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pw)}@db.example:5432/medsupply_test`;
    const output =
      `Error: P1000: Authentication failed against database server at \`db.example\`, the provided database credentials for \`${user}\` are not valid.\n` +
      `Datasource url ${encoded} / ${user}:${pw} / ${encodeURIComponent(user)} ${encodeURIComponent(pw)}`;

    const err = migrateFailureError(encoded, 1, output);

    expect(err).toBeInstanceOf(TestDatabaseError);
    const text = surface(err);
    for (const secret of [user, encodeURIComponent(user), pw, encodeURIComponent(pw), encoded]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(URL_PATTERN);
    expect(text).toContain('P1000');
    expect(text).toContain('código 1');
    expect(text).toContain('db.example');
  });

  test('QA-00.5-07 una contraseña con % mal codificado no lanza URIError y conserva la salida redactada', () => {
    const url = 'postgresql://qa_user:ab%zz@127.0.0.1:5432/medsupply_test';
    const output = 'Error: P1001: Can\'t reach database server; secret literal ab%zz here';

    let err: unknown;
    expect(() => {
      err = migrateFailureError(url, 1, output);
    }).not.toThrow();

    const text = surface(err);
    expect(err).toBeInstanceOf(TestDatabaseError);
    expect(text).not.toContain('ab%zz');
    expect(text).toContain('P1001');
    expect(text).toContain('secret literal');
  });

  test('QA-00.5-07 un usuario muy corto no destroza el mensaje', () => {
    const err = migrateFailureError('postgresql://a:b@127.0.0.1:5432/medsupply_test', 1, 'Error: P1000: credentials for `a` are not valid; database absent');
    const text = surface(err);
    expect(text).toContain('P1000');
    expect(text).toContain('database absent');
    expect(text).not.toContain('`a`');
  });

  test('QA-00.5-07 la implementación usa el binario local con la URL en el entorno, nunca en argumentos', () => {
    // Inspección de la fuente del arnés.
    const source = readFileSync(path.join(__dirname, 'helpers/test-database.ts'), 'utf8');
    expect(source).toContain("'node_modules', '.bin', 'prisma'");
    expect(source).toMatch(/\['migrate', 'deploy'\]/);
  });
});

async function oidOf(client: Client, name: string): Promise<number | undefined> {
  const { rows } = await client.query('SELECT oid::int AS oid FROM pg_database WHERE datname = $1', [name]);
  return rows[0]?.oid as number | undefined;
}

describe('TK-00.5 · recreación (integración, PostgreSQL real)', () => {
  test('QA-00.5-01 / 02 / 14 recrea medsupply_test: oid nuevo, dueño = rol de aplicación, migraciones completas; medsupply intacta', async () => {
    const before = await connectTestDatabase();
    await before.query("INSERT INTO customers (business_name, tax_id, phone) VALUES ('X', '1-9', '+56911111111')");
    const oidBefore = await oidOf(before, 'medsupply_test');
    const mainBefore = await oidOf(before, 'medsupply');
    await before.end();

    const recorded: string[] = [];
    const deps: RecreateDeps = {
      async connect(url) {
        const real = await defaultRecreateDeps.connect(url);
        return {
          query: async (text, values) => {
            recorded.push(text);
            return real.query(text, values);
          },
          end: () => real.end(),
        };
      },
      migrate: defaultRecreateDeps.migrate,
    };
    await recreateTestDatabase(process.env.DATABASE_URL, deps);

    // QA-00.5-02: ninguna sentencia nombra otra base que medsupply_test.
    expect(recorded.join('\n')).not.toMatch(/medsupply(?!_test)/);

    const after = await connectTestDatabase();
    try {
      expect(await oidOf(after, 'medsupply_test')).not.toBe(oidBefore);
      expect(await oidOf(after, 'medsupply')).toBe(mainBefore);

      // QA-00.5-14: dueño = rol de aplicación, que no es superusuario.
      const owner = await after.query(
        `SELECT d.datdba = r.oid AS owned, r.rolsuper AS super FROM pg_database d, pg_roles r
         WHERE d.datname = 'medsupply_test' AND r.rolname = current_user`,
      );
      expect(owner.rows[0]).toEqual({ owned: true, super: false });

      // QA-00.5-01: todas las migraciones aplicadas.
      const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
      const { rows } = await after.query(
        'SELECT count(*)::int AS total, count(finished_at)::int AS finished, count(rolled_back_at)::int AS rolled FROM _prisma_migrations',
      );
      expect(rows[0]).toEqual({ total: dirs.length, finished: dirs.length, rolled: 0 });
      const customers = await after.query('SELECT count(*)::int AS n FROM customers');
      expect(customers.rows[0].n).toBe(0);
    } finally {
      await after.end();
    }
  }, 120_000);

  test('QA-00.5-01 (A6) con medsupply_test inexistente la crea y migra', async () => {
    const maintenance = await defaultRecreateDeps.connect(deriveMaintenanceUrl(deriveTestDatabaseUrl()));
    try {
      await maintenance.query('DROP DATABASE medsupply_test');
    } finally {
      await maintenance.end();
    }

    await recreateTestDatabase();

    const client = await connectTestDatabase();
    try {
      const { rows } = await client.query('SELECT count(finished_at)::int AS n FROM _prisma_migrations');
      expect(rows[0].n).toBeGreaterThan(0);
    } finally {
      await client.end();
    }
  }, 120_000);

  test('QA-00.5-05 con otra sesión abierta: error 55006 controlado, la sesión ajena sigue viva y no se migra', async () => {
    const other = await connectTestDatabase();
    const migrate = jest.fn();
    try {
      const err = await capture(recreateTestDatabase(process.env.DATABASE_URL, { ...defaultRecreateDeps, migrate }));

      expect(err).toBeInstanceOf(TestDatabaseError);
      expect((err as TestDatabaseError).code).toBe('55006');
      expect(surface(err)).not.toMatch(URL_PATTERN);
      expect(surface(err)).not.toContain(new URL(process.env.DATABASE_URL as string).password);
      expect(migrate).not.toHaveBeenCalled();
      expect((await other.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
    } finally {
      await other.end();
    }
    // PostgreSQL espera unos 5 s a que las otras sesiones terminen antes de devolver 55006.
  }, 60_000);
});
