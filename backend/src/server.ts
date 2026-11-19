import { createApp } from './app';
import { loadConfig, type Config } from './config/env';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  // Solo el mensaje: nombra las variables inválidas sin sus valores (RNF-08).
  process.stderr.write(`${err instanceof Error ? err.message : 'Configuración inválida'}\n`);
  process.exit(1);
}

createApp().listen(config.port);
