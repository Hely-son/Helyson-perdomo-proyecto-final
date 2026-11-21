import { test, expect } from '@playwright/test';
import config from '../playwright.config';
import { resolveApiProxyTarget } from '../vite.config';

// QA-00.5-33 (D-7): el proxy de Vite (5174) debe apuntar al backend E2E (3100), no al 3000 por defecto.
// No depende del estado del puerto 3000: se comprueba el destino que playwright.config.ts entrega a Vite,
// cómo lo resuelve vite.config.ts y que el proxy responde (el health solo prueba que el destino vive).
test('el proxy de /api apunta al backend de E2E', async ({ request }) => {
  const servers = [config.webServer ?? []].flat();
  const vite = servers.find((s) => s.command.includes('vite'));
  expect(vite, 'webServer de Vite en playwright.config.ts').toBeDefined();

  const target = resolveApiProxyTarget(vite!.env ?? {});
  expect(target).toBe('http://127.0.0.1:3100');

  const response = await request.get('/api/v1/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
