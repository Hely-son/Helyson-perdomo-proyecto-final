import { readFileSync } from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import { parseSeedConfig, SeedConfigError } from '../../../src/seed/config';

// TK-00.4 · variables del seed (plan N2; RNF-08; spec 05 §15.3, DP-08; ESC-51).
// Escenarios: docs/qa/TK-00.4-scenarios.md (QA-00.4-03..08).

const DB_PASS = 'QaSeedDbPass77';
const VALID_DB_URL = `postgresql://qa_seed:${DB_PASS}@localhost:5432/medsupply_test`;
const PASSWORD = 'Seed-Pass-Ficticia-QA-91';
const SEED_VARS = ['DATABASE_URL', 'SEED_OPERATOR_EMAIL', 'SEED_OPERATOR_PASSWORD', 'SEED_OPERATOR_NAME'] as const;

function validEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    DATABASE_URL: VALID_DB_URL,
    SEED_OPERATOR_EMAIL: 'operador.qa@example.test',
    SEED_OPERATOR_PASSWORD: PASSWORD,
    SEED_OPERATOR_NAME: 'Operador QA',
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function captureError(fn: () => unknown): SeedConfigError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SeedConfigError);
    return err as SeedConfigError;
  }
  throw new Error('se esperaba SeedConfigError');
}

/** Todo lo que podría llegar a un log: mensaje, stack e inspección completa del error. */
function visibleText(err: SeedConfigError): string {
  return `${err.message}\n${err.stack ?? ''}\n${inspect(err, { depth: 10 })}`;
}

describe('TK-00.4 · parseSeedConfig', () => {
  test('QA-00.4-03 N2 entorno válido sin JWT_SECRET: devuelve la URL y el operador', () => {
    const env = validEnv();
    expect(env.JWT_SECRET).toBeUndefined();
    const config = parseSeedConfig(env);
    expect(config.databaseUrl).toBe(VALID_DB_URL);
    expect(config.operator.email).toBe('operador.qa@example.test');
    expect(config.operator.password).toBe(PASSWORD);
    expect(config.operator.name).toBe('Operador QA');
  });

  test.each(SEED_VARS.flatMap((name) => [[name, 'ausente', undefined] as const, [name, 'vacía', ''] as const]))(
    'QA-00.4-04 N2 %s %s: SeedConfigError que la nombra',
    (name, _label, value) => {
      const err = captureError(() => parseSeedConfig(validEnv({ [name]: value })));
      expect(err.variables).toEqual([name]);
      expect(err.message).toContain(name);
      if (name !== 'SEED_OPERATOR_PASSWORD') expect(visibleText(err)).not.toContain(PASSWORD);
    },
  );

  test.each([
    ['SEED_OPERATOR_EMAIL', 'no-es-un-email-QA'],
    ['SEED_OPERATOR_EMAIL', 'operador@'],
    ['SEED_OPERATOR_NAME', '   '],
    ['DATABASE_URL', `mysql://qa_seed:${DB_PASS}@localhost:3306/medsupply_test`],
    ['DATABASE_URL', 'no-es-una-url-QA'],
  ])('QA-00.4-05 N2 RNF-08 %s=%j inválida: el error la nombra sin mostrar valores', (name, value) => {
    const err = captureError(() => parseSeedConfig(validEnv({ [name]: value })));
    expect(err.variables).toEqual([name]);
    const text = visibleText(err);
    expect(text).toContain(name);
    if (value.trim() !== '') expect(text).not.toContain(value);
    expect(text).not.toContain(DB_PASS);
    expect(text).not.toContain(PASSWORD);
  });

  test('QA-00.4-06 DP-08 sin política de complejidad: una contraseña de un carácter se acepta', () => {
    expect(parseSeedConfig(validEnv({ SEED_OPERATOR_PASSWORD: 'a' })).operator.password).toBe('a');
  });

  test('QA-00.4-07 N2 varias variables inválidas: un único error las nombra todas, sin valores', () => {
    const err = captureError(() =>
      parseSeedConfig(
        validEnv({ DATABASE_URL: undefined, SEED_OPERATOR_EMAIL: 'malo-QA', SEED_OPERATOR_NAME: '', SEED_OPERATOR_PASSWORD: '' }),
      ),
    );
    expect([...err.variables].sort()).toEqual([...SEED_VARS].sort());
    for (const name of SEED_VARS) expect(err.message).toContain(name);
    expect(visibleText(err)).not.toContain('malo-QA');
  });
});

describe('TK-00.4 · .env.example', () => {
  test('QA-00.4-08 ESC-51 RNF-08 las tres SEED_OPERATOR_* existen sin valor (marcador de posición)', () => {
    const example = readFileSync(path.resolve(__dirname, '../../../../.env.example'), 'utf8');
    for (const name of ['SEED_OPERATOR_EMAIL', 'SEED_OPERATOR_PASSWORD', 'SEED_OPERATOR_NAME']) {
      const lines = example.split(/\r?\n/).filter((line) => line.startsWith(`${name}=`));
      expect({ name, lines }).toEqual({ name, lines: [`${name}=`] });
    }
  });
});
