import type { Express } from 'express';
import { createApp, type CreateAppOptions } from '../../src/app';
import { createPrismaClient } from '../../src/lib/prisma';
import type { FakeProductsService } from './chat-products';

// Utilidad de pruebas: createApp con las dependencias obligatorias de TK-01.1 para las pruebas que no
// usan autenticación ni base de datos. El cliente apunta a un servidor inexistente (conexión perezosa):
// si algún test lo usara, fallaría.
// TK-05.1: `chatSessionStore` permite inyectar el almacén de sesiones de chat (opción nueva de CreateAppOptions).
export const TEST_AUTH = { jwtSecret: 'test-secreto-ficticio-solo-pruebas-0123456789', jwtExpiresIn: '8h' };
const prisma = createPrismaClient('postgresql://test_sin_bd:test_sin_bd@127.0.0.1:9/test_sin_bd');

// TK-05.2: `chatProducts` inyecta el servicio de productos que consume el chat (supuesto de QA: opción nueva y opcional de
// CreateAppOptions; si no se pasa, createApp usa el servicio real sobre `prisma`). Permite probar el chat sin base de datos.
export function createTestApp(
  options: Pick<CreateAppOptions, 'testRouter' | 'chatSessionStore'> & { chatProducts?: FakeProductsService } = {},
): Express {
  return createApp({ auth: TEST_AUTH, prisma, ...options });
}
