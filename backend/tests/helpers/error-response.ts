import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Response } from 'supertest';

// Fuente única de los códigos: components.schemas.ErrorCode de docs/openapi.yaml (RNF-02).
// Se leen del contrato para no duplicar la lista en los tests.
const OPENAPI_PATH = path.resolve(__dirname, '../../../docs/openapi.yaml');

function loadErrorCodes(): string[] {
  const lines = readFileSync(OPENAPI_PATH, 'utf8').split('\n');
  const start = lines.findIndex((line) => /^ {4}ErrorCode:\s*$/.test(line));
  if (start === -1) {
    throw new Error(`No se encontró components.schemas.ErrorCode en ${OPENAPI_PATH}`);
  }
  const enumIdx = lines.findIndex((line, i) => i > start && /^ {6}enum:\s*$/.test(line));
  const codes: string[] = [];
  for (let i = enumIdx + 1; i < lines.length; i++) {
    const match = /^ {8}- ([A-Z_]+)\s*$/.exec(lines[i]);
    if (!match) break;
    codes.push(match[1]);
  }
  if (codes.length === 0) {
    throw new Error('El enum ErrorCode del contrato está vacío o no se pudo leer');
  }
  return codes;
}

export const ERROR_CODES: readonly string[] = loadErrorCodes();

/**
 * Exige una respuesta de error conforme al esquema `Error` del contrato:
 * Content-Type JSON, cuerpo exactamente `{ error: { code, message } }`,
 * `code` del enum ErrorCode y `message` texto no vacío.
 */
export function expectErrorResponse(res: Response, status: number, code: string): void {
  expect(ERROR_CODES).toContain(code);
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/^application\/json/);
  expect(res.body).not.toBeNull();
  expect(typeof res.body).toBe('object');
  expect(Object.keys(res.body).sort()).toEqual(['error']);
  expect(res.body.error).not.toBeNull();
  expect(typeof res.body.error).toBe('object');
  expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message']);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe('string');
  expect(res.body.error.message.length).toBeGreaterThan(0);
}
