import { createApp } from './app';
import { loadConfig, type Config } from './config/env';
import { createPrismaClient } from './lib/prisma';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  // Solo el mensaje: nombra las variables inválidas sin sus valores (RNF-08).
  process.stderr.write(`${err instanceof Error ? err.message : 'Configuración inválida'}\n`);
  process.exit(1);
}

const prisma = createPrismaClient(config.databaseUrl);
const app = createApp({ auth: { jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn }, prisma });

app.listen(config.port).on('error', (err: NodeJS.ErrnoException) => {
  // Mensaje controlado: sin stack ni detalles del error.
  const message =
    err.code === 'EADDRINUSE'
      ? `El puerto ${config.port} está ocupado`
      : `No se pudo iniciar el servidor (${err.code ?? 'error desconocido'})`;
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
