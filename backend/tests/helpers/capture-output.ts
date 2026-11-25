import { format } from 'node:util';

// Utilidad de pruebas (TK-01.1, ESC-51 y D4a): captura todo lo que la aplicación escribe por consola o
// directamente en stdout/stderr mientras dura la prueba, y lo silencia. Siempre llamar a restore().

export interface CapturedOutput {
  stdout: () => string;
  stderr: () => string;
  all: () => string;
  restore: () => void;
}

export function captureOutput(): CapturedOutput {
  const out: string[] = [];
  const err: string[] = [];
  const toText = (chunk: unknown): string => (Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));

  const spies = [
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => (out.push(toText(chunk)), true)),
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => (err.push(toText(chunk)), true)),
    ...(['log', 'info', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation((...args: unknown[]) => void out.push(format(...args))),
    ),
    ...(['error', 'warn'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation((...args: unknown[]) => void err.push(format(...args))),
    ),
  ];

  return {
    stdout: () => out.join('\n'),
    stderr: () => err.join('\n'),
    all: () => [...out, ...err].join('\n'),
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}
