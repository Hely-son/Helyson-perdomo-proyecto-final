import { spawn } from 'node:child_process';
import path from 'node:path';

// QA-12 (TK-00.1): con configuración inválida el proceso termina con error antes de escuchar.
// Se lanza src/server.ts con tsx directamente (sin --env-file), así no depende de ../.env.

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TSX_CLI = path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const KILL_AFTER_MS = 15_000;

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

function runServer(env: NodeJS.ProcessEnv): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_CLI, 'src/server.ts'], {
      cwd: BACKEND_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stdout, stderr });
    });
  });
}

describe('TK-00.1 · arranque del servidor', () => {
  test(
    'QA-12: con JWT_SECRET inválido el proceso termina con código ≠ 0 antes de escuchar, nombra la variable y no muestra el secreto',
    async () => {
      const secret = 'QA12SECRETOCORTO'; // 16 bytes: inválido
      const result = await runServer({
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        PORT: '39123',
        DATABASE_URL: 'postgresql://qa12user:QA12DBPASS@localhost:5432/medsupply',
        JWT_SECRET: secret,
      });

      // Si llegara a escuchar no terminaría por sí solo y lo cortaría el temporizador.
      expect(result.timedOut).toBe(false);
      expect(result.code).not.toBeNull();
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('JWT_SECRET');
      expect(result.stderr).not.toContain(secret);
      expect(result.stdout).not.toContain(secret);
      expect(result.stderr).not.toContain('QA12DBPASS');
      expect(result.stdout).not.toContain('QA12DBPASS');
    },
    KILL_AFTER_MS + 10_000,
  );
});
