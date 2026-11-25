import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Fábrica del cliente de base de datos de la aplicación (TK-02.4, D-A). Sin estado de módulo y sin leer
// process.env: quien la llama pasa la URL y es quien cierra el cliente ($disconnect). No registra la URL.
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
