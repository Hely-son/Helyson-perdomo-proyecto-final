import http from 'node:http';
import type { AddressInfo } from 'node:net';

// Utilidad de pruebas (TK-00.5, A9): servidor http real en 127.0.0.1 con puerto efímero y N peticiones
// HTTP en paralelo. No toca la base de datos; sirve para ejercitar el stack HTTP real.

export interface RealServer {
  address: { address: string; port: number };
}

export interface HttpResult {
  status: number;
  body: string;
}

/** Arranca `handler` en un servidor real, ejecuta `fn` y siempre cierra el servidor. */
export async function withRealServer<T>(handler: http.RequestListener, fn: (server: RealServer) => Promise<T>): Promise<T> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    return await fn({ address: server.address() as AddressInfo });
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}

/** Lanza `n` GET a la vez (una conexión nueva cada una) y devuelve las respuestas. */
export function fireConcurrent(server: RealServer, n: number, path: string): Promise<HttpResult[]> {
  const one = () =>
    new Promise<HttpResult>((resolve, reject) => {
      const req = http.get({ host: server.address.address, port: server.address.port, path, agent: false }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
    });
  return Promise.all(Array.from({ length: n }, one));
}
