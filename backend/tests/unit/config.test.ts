import { inspect } from 'node:util';
import { loadConfig } from '../../src/config/env';

// Pruebas de aceptación de TK-00.1 (configuración). Decisiones: backlog/00_habilitadores.md,
// TK-00.1 "Decisiones de implementación" (A2 vacías, A3 bytes UTF-8, A4 formato, A5 DATABASE_URL).

const VALID_SECRET = 'qa-valid-secret-0123456789abcdefghij'; // 36 bytes ASCII
const VALID_DB_URL = 'postgresql://qa_user:qa_pass@localhost:5432/medsupply';

function validEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PORT: '4000',
    DATABASE_URL: VALID_DB_URL,
    JWT_SECRET: VALID_SECRET,
    JWT_EXPIRES_IN: '2h',
    CHAT_SESSION_TTL_MINUTES: '45',
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('Se esperaba que loadConfig lanzara un error y no lo hizo');
}

function errorMessage(err: unknown): string {
  expect(err).toBeInstanceOf(Error);
  return (err as Error).message;
}

/** Todo el texto observable de un error: message, stack, JSON, inspect, issues y cause. */
function errorSurface(err: unknown): string {
  const parts: string[] = [];
  const safeJson = (value: unknown): string => {
    try {
      return JSON.stringify(value) ?? '';
    } catch {
      return '';
    }
  };
  if (err instanceof Error) {
    parts.push(err.message, err.stack ?? '');
    const extra = err as Error & { issues?: unknown; cause?: unknown };
    parts.push(safeJson(extra.issues), safeJson(extra.cause), String(extra.cause ?? ''));
    if (extra.cause instanceof Error) parts.push(extra.cause.message, extra.cause.stack ?? '');
  }
  parts.push(safeJson(err), inspect(err, { depth: Infinity, showHidden: true }));
  return parts.join('\n');
}

describe('TK-00.1 · loadConfig(env)', () => {
  test('QA-01: entorno completo válido devuelve los valores tipados', () => {
    const config = loadConfig(validEnv());
    expect(config).toEqual({
      port: 4000,
      databaseUrl: VALID_DB_URL,
      jwtSecret: VALID_SECRET,
      jwtExpiresIn: '2h',
      chatSessionTtlMinutes: 45,
    });
    expect(typeof config.port).toBe('number');
    expect(typeof config.chatSessionTtlMinutes).toBe('number');
  });

  test('QA-02: sin PORT, JWT_EXPIRES_IN ni CHAT_SESSION_TTL_MINUTES aplica 3000, "8h" y 30', () => {
    const config = loadConfig(
      validEnv({ PORT: undefined, JWT_EXPIRES_IN: undefined, CHAT_SESSION_TTL_MINUTES: undefined }),
    );
    expect(config.port).toBe(3000);
    expect(config.jwtExpiresIn).toBe('8h');
    expect(config.chatSessionTtlMinutes).toBe(30);
  });

  test('QA-02 (A2): opcionales presentes pero vacías cuentan como ausentes', () => {
    const config = loadConfig(validEnv({ PORT: '', JWT_EXPIRES_IN: '', CHAT_SESSION_TTL_MINUTES: '' }));
    expect(config.port).toBe(3000);
    expect(config.jwtExpiresIn).toBe('8h');
    expect(config.chatSessionTtlMinutes).toBe(30);
  });

  test.each([
    ['ausente', undefined],
    ['vacía', ''],
  ])('QA-03: DATABASE_URL %s produce un error que la nombra', (_label, value) => {
    const err = captureError(() => loadConfig(validEnv({ DATABASE_URL: value })));
    expect(errorMessage(err)).toContain('DATABASE_URL');
  });

  test.each([
    ['ausente', undefined],
    ['vacía', ''],
  ])('QA-04: JWT_SECRET %s produce un error que la nombra', (_label, value) => {
    const err = captureError(() => loadConfig(validEnv({ JWT_SECRET: value })));
    expect(errorMessage(err)).toContain('JWT_SECRET');
  });

  describe('QA-05 (A3): longitud mínima de JWT_SECRET en bytes UTF-8', () => {
    test.each([
      ['31 caracteres ASCII (31 bytes)', 'a'.repeat(31)],
      ['15 "ñ" + 1 ASCII: 16 caracteres pero 31 bytes', 'ñ'.repeat(15) + 'a'],
    ])('QA-05: se rechaza %s', (_label, secret) => {
      expect(Buffer.byteLength(secret, 'utf8')).toBe(31);
      const err = captureError(() => loadConfig(validEnv({ JWT_SECRET: secret })));
      expect(errorMessage(err)).toContain('JWT_SECRET');
    });

    test.each([
      ['32 caracteres ASCII (32 bytes)', 'a'.repeat(32)],
      ['16 "ñ" de 2 bytes (32 bytes)', 'ñ'.repeat(16)],
    ])('QA-05: se acepta %s', (_label, secret) => {
      expect(Buffer.byteLength(secret, 'utf8')).toBe(32);
      expect(loadConfig(validEnv({ JWT_SECRET: secret })).jwtSecret).toBe(secret);
    });
  });

  describe('QA-06 (A5): los valores de JWT_SECRET y DATABASE_URL no se filtran en el error', () => {
    const SECRET_SHORT = 'QA06SECRETOCORTO'; // 16 bytes: inválido
    const SECRET_VALID = 'QA06SECRETOVALIDO-0123456789abcdef'; // 34 bytes: válido
    const DB_INVALID = 'mysql://qa06user:QA06DBPASSINVALIDA@host/db';
    const DB_VALID = 'postgresql://qa06user:QA06DBPASSVALIDA@localhost:5432/medsupply';

    test('QA-06: JWT_SECRET inválido no aparece en el error', () => {
      const err = captureError(() => loadConfig(validEnv({ JWT_SECRET: SECRET_SHORT, DATABASE_URL: DB_VALID })));
      expect(errorMessage(err)).toContain('JWT_SECRET');
      const surface = errorSurface(err);
      expect(surface).not.toContain(SECRET_SHORT);
      expect(surface).not.toContain('QA06DBPASSVALIDA');
    });

    test('QA-06: DATABASE_URL inválida no aparece en el error', () => {
      const err = captureError(() => loadConfig(validEnv({ DATABASE_URL: DB_INVALID, JWT_SECRET: SECRET_VALID })));
      expect(errorMessage(err)).toContain('DATABASE_URL');
      const surface = errorSurface(err);
      expect(surface).not.toContain('QA06DBPASSINVALIDA');
      expect(surface).not.toContain(SECRET_VALID);
    });

    test('QA-06: si falla otra variable, ni JWT_SECRET ni DATABASE_URL válidos aparecen en el error', () => {
      const err = captureError(() =>
        loadConfig(validEnv({ PORT: 'abc', JWT_SECRET: SECRET_VALID, DATABASE_URL: DB_VALID })),
      );
      expect(errorMessage(err)).toContain('PORT');
      const surface = errorSurface(err);
      expect(surface).not.toContain(SECRET_VALID);
      expect(surface).not.toContain('QA06DBPASSVALIDA');
      expect(surface).not.toContain(DB_VALID);
    });
  });

  test.each(['abc', '0', '-1', '65536', '3000.5'])('QA-07: PORT inválido "%s" produce un error que lo nombra', (port) => {
    const err = captureError(() => loadConfig(validEnv({ PORT: port })));
    expect(errorMessage(err)).toContain('PORT');
  });

  test.each([
    ['1', 1],
    ['65535', 65535],
  ])('QA-07: PORT en los límites "%s" se acepta', (port, expected) => {
    expect(loadConfig(validEnv({ PORT: port })).port).toBe(expected);
  });

  test.each(['abc', '0', '-5', '1.5'])(
    'QA-08: CHAT_SESSION_TTL_MINUTES inválido "%s" produce un error que lo nombra',
    (ttl) => {
      const err = captureError(() => loadConfig(validEnv({ CHAT_SESSION_TTL_MINUTES: ttl })));
      expect(errorMessage(err)).toContain('CHAT_SESSION_TTL_MINUTES');
    },
  );

  test.each(['abc', '8x', 'h8', '0h', '1.5h', '3600'])(
    'QA-09 (A4): JWT_EXPIRES_IN inválido "%s" produce un error que lo nombra',
    (value) => {
      const err = captureError(() => loadConfig(validEnv({ JWT_EXPIRES_IN: value })));
      expect(errorMessage(err)).toContain('JWT_EXPIRES_IN');
    },
  );

  test.each(['1s', '30m', '8h', '1d'])('QA-09 (A4): JWT_EXPIRES_IN válido "%s" se acepta', (value) => {
    expect(loadConfig(validEnv({ JWT_EXPIRES_IN: value })).jwtExpiresIn).toBe(value);
  });

  test.each(['not-a-url', 'localhost:5432/medsupply', 'mysql://u:p@h/db'])(
    'QA-10: DATABASE_URL inválida "%s" produce un error que la nombra',
    (url) => {
      const err = captureError(() => loadConfig(validEnv({ DATABASE_URL: url })));
      expect(errorMessage(err)).toContain('DATABASE_URL');
    },
  );

  test.each(['postgres://u:p@localhost:5432/medsupply', 'postgresql://u:p@localhost:5432/medsupply'])(
    'QA-10: DATABASE_URL válida "%s" se acepta',
    (url) => {
      expect(loadConfig(validEnv({ DATABASE_URL: url })).databaseUrl).toBe(url);
    },
  );

  test('QA-11: varias variables inválidas producen un único error que las nombra todas, sin sus valores', () => {
    const values = {
      PORT: 'puerto-QA11',
      DATABASE_URL: 'mysql://qa11:QA11DBMARCA@host/db',
      JWT_SECRET: 'QA11SECRETOCORTO',
      JWT_EXPIRES_IN: 'expira-QA11',
      CHAT_SESSION_TTL_MINUTES: 'ttl-QA11',
    };
    const err = captureError(() => loadConfig(validEnv(values)));
    const message = errorMessage(err);
    for (const name of Object.keys(values)) {
      expect(message).toContain(name);
    }
    const surface = errorSurface(err);
    for (const marker of ['puerto-QA11', 'QA11DBMARCA', 'QA11SECRETOCORTO', 'expira-QA11', 'ttl-QA11']) {
      expect(surface).not.toContain(marker);
    }
  });
});
