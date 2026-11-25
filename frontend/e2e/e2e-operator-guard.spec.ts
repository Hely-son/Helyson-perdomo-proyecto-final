import { spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { BACKEND_DIR, TSX_BIN, UPSERT_SCRIPT } from './global-setup';

// QA-01.2-28 (TK-01.2, D2): el script del operador E2E solo escribe en medsupply_test y valida el destino
// ANTES de conectarse. Se usa un host inalcanzable (puerto 1): si el script intentara conectarse, el error
// sería de conexión y no el mensaje fijo de la barrera. Ninguna URL lleva credenciales reales.

const GUARD_MESSAGE = 'la base destino no es medsupply_test; no se conecta ni se escribe nada.';
const OPERATOR_MESSAGE = 'faltan o son inválidas las variables del operador E2E; no se conecta ni se escribe nada.';

function runScript(env: Record<string, string>) {
  const started = Date.now();
  const result = spawnSync(TSX_BIN, [UPSERT_SCRIPT], {
    cwd: BACKEND_DIR,
    shell: false,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
    timeout: 30_000,
  });
  return { ...result, elapsedMs: Date.now() - started };
}

const OPERATOR = {
  E2E_OPERATOR_EMAIL: 'operador.e2e@medsupply.test',
  E2E_OPERATOR_NAME: 'Operadora E2E Ficticia',
  E2E_OPERATOR_PASSWORD: 'ficticia-solo-para-la-barrera',
};

test.describe('QA-01.2-28 (D2): barrera de destino del script del operador E2E', () => {
  for (const [name, url] of [
    ['base de desarrollo medsupply', 'postgresql://u:p@127.0.0.1:1/medsupply'],
    ['otra base', 'postgresql://u:p@127.0.0.1:1/postgres'],
    ['prefijo de medsupply_test', 'postgresql://u:p@127.0.0.1:1/medsupply_test_x'],
    ['parámetro que cambia la base', 'postgresql://u:p@127.0.0.1:1/medsupply_test?database=medsupply'],
    ['esquema no PostgreSQL', 'mysql://u:p@127.0.0.1:1/medsupply_test'],
    ['URL ausente', ''],
  ] as const) {
    test(`${name} → aborta con código ≠ 0 sin conectarse`, () => {
      const result = runScript({ ...OPERATOR, DATABASE_URL: url });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(GUARD_MESSAGE);
      expect(result.stdout).not.toContain('preparado');
      expect(result.stderr).not.toContain('u:p@');
    });
  }

  test('un email fuera del dominio .test (p. ej. el del seed) → aborta sin conectarse', () => {
    const result = runScript({
      ...OPERATOR,
      E2E_OPERATOR_EMAIL: 'operador@medsupply.com',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/medsupply_test',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(OPERATOR_MESSAGE);
  });
});
