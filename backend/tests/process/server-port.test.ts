import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

// TK-01.1 · D4b (puerta 1): con el puerto ocupado el servidor termina con código 1 y un mensaje controlado,
// sin líneas de stack ni secretos. Se lanza src/server.ts con tsx (sin --env-file), como QA-12 de TK-00.1.
// El puerto se ocupa igual que lo abre el servidor (listen sin host), para que el conflicto sea determinista.
// Escenarios: docs/qa/TK-01.1-matrix.md.

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TSX_CLI = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const KILL_AFTER_MS = 15_000;
const JWT_SECRET = 'qa-d4b-secreto-ficticio-solo-pruebas-0123456789';
const DB_PASSWORD = 'QAD4BDBPASSFICTICIA';
const STACK_LINE = /\bat .+:\d+:\d+/;

interface RunResult {
  code: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

function runServer(env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, 'src/server.ts'], { cwd: BACKEND_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
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
      resolve({ code, timedOut, stdout, stderr });
    });
  });
}

describe('TK-01.1 · D4b arranque con el puerto ocupado', () => {
  let blocker: net.Server;
  let port: number;

  beforeAll(async () => {
    blocker = net.createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject);
      blocker.listen(0, resolve);
    });
    port = (blocker.address() as net.AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  });

  test(
    'D4b puerto ocupado (EADDRINUSE) → exit 1, mensaje controlado en stderr, sin stack ni secretos',
    async () => {
      const result = await runServer({
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        PORT: String(port),
        DATABASE_URL: `postgresql://qa_d4b:${DB_PASSWORD}@127.0.0.1:9/qa_d4b`,
        JWT_SECRET,
      });

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr.trim().length).toBeGreaterThan(0);
      for (const stream of [result.stderr, result.stdout]) {
        expect(stream).not.toMatch(STACK_LINE);
        expect(stream).not.toContain('node:internal');
        expect(stream).not.toContain(JWT_SECRET);
        expect(stream).not.toContain(DB_PASSWORD);
      }
    },
    KILL_AFTER_MS + 10_000,
  );
});
