import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// DATABASE_URL solo se lee del entorno o de ../.env; no se exige para `prisma generate` ni `prisma validate`.
if (existsSync('../.env')) process.loadEnvFile('../.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
