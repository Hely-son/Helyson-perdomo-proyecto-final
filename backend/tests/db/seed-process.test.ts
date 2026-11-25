import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Client } from 'pg';
import { normalizePhone } from '../../src/modules/customers/customers.service';
import { DEFAULT_SEED_FIXTURES } from '../../src/seed/fixtures';
import { connectTestDatabase, deriveTestDatabaseUrl } from './helpers/test-database';

// TK-00.4 · punto de entrada del seed (src/seed/index.ts) como proceso hijo, SIEMPRE contra medsupply_test:
// DATABASE_URL del hijo = deriveTestDatabaseUrl(); nunca la base medsupply. Va en la suite de BD (npm run test:db)
// porque necesita PostgreSQL, el arnés de limpieza y ejecución en serie.
// Plan aprobado: N2 (variables), N4 (conflicto → 1), salida 0/1, sin secretos en stdout/stderr (RNF-08, DP-08).
// Escenarios: docs/qa/TK-00.4-scenarios.md (QA-00.4-17, 29..32).

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TSX_CLI = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const KILL_AFTER_MS = 30_000;
const PASSWORD = 'Seed-Pass-Proceso-QA-58';

interface RunResult {
  code: number | null;
  timedOut: boolean;
  output: string;
}

let pg: Client;
beforeAll(async () => {
  pg = await connectTestDatabase();
});
afterAll(async () => {
  await pg?.end();
});

function seedEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    DATABASE_URL: deriveTestDatabaseUrl(),
    SEED_OPERATOR_EMAIL: 'operador.proceso@example.test',
    SEED_OPERATOR_PASSWORD: PASSWORD,
    SEED_OPERATOR_NAME: 'Operador Proceso QA',
    ...overrides,
  };
}

function runSeedProcess(env: NodeJS.ProcessEnv): Promise<RunResult> {
  if (!env.DATABASE_URL?.includes('/medsupply_test')) throw new Error('la prueba de proceso solo se ejecuta contra medsupply_test');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, 'src/seed/index.ts'], { cwd: BACKEND_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, KILL_AFTER_MS);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, output });
    });
  });
}

async function count(table: string): Promise<number> {
  const { rows } = await pg.query(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n as number;
}

async function digestAll(): Promise<string> {
  const parts: string[] = [];
  for (const t of ['users', 'customers', 'products', 'orders', 'order_items']) {
    const { rows } = await pg.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) AS h FROM ${t} t`);
    parts.push(`${t}=${rows[0].n}:${rows[0].h}`);
  }
  return parts.join(' ');
}

function phones(): string[] {
  return DEFAULT_SEED_FIXTURES.customers.flatMap((c) => {
    const r = normalizePhone(c.phone);
    return r.ok ? [c.phone, r.phone] : [c.phone];
  });
}

function expectNoSecrets(output: string, databaseUrl: string, extra: string[] = []): void {
  const url = new URL(databaseUrl);
  const secrets = [PASSWORD, databaseUrl, ...phones(), ...extra];
  if (url.password.length >= 3) secrets.push(decodeURIComponent(url.password));
  for (const s of secrets) expect({ leaked: output.includes(s), s }).toEqual({ leaked: false, s });
}

describe('TK-00.4 · punto de entrada del seed contra medsupply_test', () => {
  test(
    'QA-00.4-29 QA-00.4-17 N2 sin JWT_SECRET: sale 0 dos veces, carga los datos, no cambia nada al repetir y no muestra secretos',
    async () => {
      const env = seedEnv();
      expect(env.JWT_SECRET).toBeUndefined();

      const first = await runSeedProcess(env);
      expect(first.timedOut).toBe(false);
      expect(first.code).toBe(0);
      expect(await count('users')).toBe(1);
      expect(await count('customers')).toBe(4);
      expect(await count('products')).toBe(10);
      expect(await count('orders')).toBe(5);
      const before = await digestAll();
      const hash = ((await pg.query('SELECT password_hash FROM users')).rows[0] as { password_hash: string }).password_hash;

      const second = await runSeedProcess(env);
      expect(second.timedOut).toBe(false);
      expect(second.code).toBe(0);
      expect(await digestAll()).toBe(before);

      expectNoSecrets(`${first.output}\n${second.output}`, env.DATABASE_URL as string, [hash]);
    },
    2 * KILL_AFTER_MS + 10_000,
  );

  test(
    'QA-00.4-30 N2 SEED_OPERATOR_EMAIL inválido: sale 1, nombra la variable, no escribe nada y no muestra valores',
    async () => {
      const env = seedEnv({ SEED_OPERATOR_EMAIL: 'no-es-email-QA' });
      const result = await runSeedProcess(env);
      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.output).toContain('SEED_OPERATOR_EMAIL');
      expect(result.output).not.toContain('no-es-email-QA');
      expectNoSecrets(result.output, env.DATABASE_URL as string);
      for (const t of ['users', 'customers', 'products', 'orders', 'order_items']) expect({ t, n: await count(t) }).toEqual({ t, n: 0 });
    },
    KILL_AFTER_MS + 10_000,
  );

  test(
    'QA-00.4-31 N4 conflicto caso B: sale 1, informa el tax_id sin teléfonos ni secretos y no carga productos ni pedidos',
    async () => {
      const target = DEFAULT_SEED_FIXTURES.customers[2];
      const used = new Set(phones());
      let otherPhone = '+56900000031';
      while (used.has(otherPhone)) otherPhone = `+569${String(Number(otherPhone.slice(4)) + 1).padStart(8, '0')}`;
      await pg.query('INSERT INTO customers (business_name, tax_id, phone) VALUES ($1, $2, $3)', ['Registro previo QA', target.taxId, otherPhone]);

      const env = seedEnv();
      const result = await runSeedProcess(env);
      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.output).toContain(target.taxId);
      expectNoSecrets(result.output, env.DATABASE_URL as string, [otherPhone]);
      expect(await count('products')).toBe(0);
      expect(await count('orders')).toBe(0);
      const { rows } = await pg.query('SELECT phone FROM customers WHERE tax_id = $1', [target.taxId]);
      expect(rows).toEqual([{ phone: otherPhone }]);
    },
    KILL_AFTER_MS + 10_000,
  );

  test(
    'QA-00.4-32 base inaccesible: sale 1 con un mensaje que no contiene la URL ni la contraseña',
    async () => {
      const url = new URL(deriveTestDatabaseUrl());
      url.port = '1'; // puerto sin servicio: la conexión se rechaza
      const env = seedEnv({ DATABASE_URL: url.toString() });
      const result = await runSeedProcess(env);
      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expectNoSecrets(result.output, url.toString());
    },
    KILL_AFTER_MS + 10_000,
  );
});
