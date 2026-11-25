import type { Express, Router } from 'express';
import { createApp } from '../../src/app';
import { createPrismaClient } from '../../src/lib/prisma';

// Utilidad de pruebas: createApp con las dependencias obligatorias de TK-01.1 para las pruebas que no
// usan autenticación ni base de datos. El cliente apunta a un servidor inexistente (conexión perezosa):
// si algún test lo usara, fallaría.
export const TEST_AUTH = { jwtSecret: 'test-secreto-ficticio-solo-pruebas-0123456789', jwtExpiresIn: '8h' };
const prisma = createPrismaClient('postgresql://test_sin_bd:test_sin_bd@127.0.0.1:9/test_sin_bd');

export function createTestApp(options: { testRouter?: Router } = {}): Express {
  return createApp({ auth: TEST_AUTH, prisma, ...options });
}
