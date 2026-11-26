import { test, expect, type Page } from '@playwright/test';
import { EXPIRED_NOTICE, emailField, loginAsE2EOperator, readStoredSession } from './support/session';
import { SESSION_STORAGE_KEY } from './support/e2e-env';

// TK-01.4 · S-1 · spec 05 §11.9 ESC-58, §15.8 "Varias pestañas"; decisiones del usuario D1 (la pestaña receptora no
// navega al recibir el evento) y D2 (no adopta sesiones de otra pestaña). Matriz: docs/qa/TK-01.4-matrix.md (E-58).
// Dos páginas del MISMO contexto de Playwright comparten localStorage, y el navegador emite un `storage` real en la
// que no hizo el cambio. Hoy ninguna pantalla hace una petición protegida al cargar, así que la "siguiente petición
// protegida" se hace con el cliente HTTP real de la app: en el servidor de Vite del E2E, importar
// /src/api/client.ts desde la página devuelve la MISMA instancia de módulo que usa la app (mapa de módulos del
// navegador por URL; se comprueba que la URL ya estaba cargada y que no se descarga de nuevo). Sin recargas: una
// recarga rehidrata desde localStorage y no prueba la memoria. El token nunca se imprime: se comparan booleanos.

const STORE_MODULE = '/src/auth/session-store.ts';
const CLIENT_MODULE = '/src/api/client.ts';

interface QaWindow {
  __qaStorageEvents: { key: string | null; hadOldValue: boolean; newValue: string | null; sameArea: boolean; fromOrigin: string }[];
  __qaWrites: string[];
}

/** Instrumentación del navegador (no de la app): listener `storage` y registro de escrituras de ESTA página. */
function instrumentReceiver(): void {
  const w = window as unknown as QaWindow;
  w.__qaStorageEvents = [];
  w.__qaWrites = [];
  window.addEventListener('storage', (e) => {
    w.__qaStorageEvents.push({
      key: e.key,
      hadOldValue: e.oldValue !== null,
      newValue: e.newValue,
      sameArea: e.storageArea === window.localStorage,
      fromOrigin: new URL(e.url).origin,
    });
  });
  const proto = Storage.prototype;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;
  const clear = proto.clear;
  proto.setItem = function (key: string, value: string) {
    w.__qaWrites.push(`setItem ${key}`);
    return setItem.call(this, key, value);
  };
  proto.removeItem = function (key: string) {
    w.__qaWrites.push(`removeItem ${key}`);
    return removeItem.call(this, key);
  };
  proto.clear = function () {
    w.__qaWrites.push('clear');
    return clear.call(this);
  };
}

/** ¿La instancia de módulo que usa la app tiene en memoria este token? (null si no hay sesión). */
function memoryHolds(page: Page, token: string): Promise<boolean | null> {
  return page.evaluate(
    async ([url, expected]) => {
      const { sessionStore } = await import(/* @vite-ignore */ url);
      const session = sessionStore.getSession() as { token: string } | null;
      return session === null ? null : session.token === expected;
    },
    [STORE_MODULE, token] as const,
  );
}

/** Veces que el navegador descargó un módulo fuente de la app (1 = una sola instancia). */
function moduleLoads(page: Page, path: string): Promise<number> {
  return page.evaluate(
    (p) => performance.getEntriesByType('resource').filter((e) => new URL(e.name).pathname === p).length,
    path,
  );
}

test('QA-01.4-E58 ESC-58 (E): Cerrar sesión en una pestaña descarta el token en memoria de la otra, que no lo envía y termina en /login sin aviso', async ({
  context,
  page: tab1,
}) => {
  // Given: sesión iniciada en la pestaña 1; la pestaña 2, del mismo contexto, abre el dashboard con esa sesión.
  const { token } = await loginAsE2EOperator(tab1);
  const tab2 = await context.newPage();
  await tab2.addInitScript(instrumentReceiver);
  await tab2.goto('/dashboard');
  await expect(tab2).toHaveURL(/\/dashboard$/);
  await expect(tab2.getByRole('heading', { name: 'Alertas de stock' })).toBeVisible();

  // Precondiciones: mismo contexto (localStorage compartido) y la app de la pestaña 2 tiene el token en memoria, en la
  // misma instancia de módulo que se consulta después.
  expect(tab1.context() === context && tab2.context() === context && context.pages().includes(tab2)).toBe(true);
  expect(await readStoredSession(tab2)).toBe(await readStoredSession(tab1));
  expect(await moduleLoads(tab2, STORE_MODULE)).toBe(1);
  expect(await memoryHolds(tab2, token)).toBe(true);
  expect(await moduleLoads(tab2, STORE_MODULE), 'la consulta no crea otra instancia').toBe(1);
  expect(await moduleLoads(tab2, CLIENT_MODULE)).toBe(1);
  await tab2.evaluate(() => {
    (window as unknown as QaWindow).__qaWrites.length = 0;
  });

  const tab2Api: { path: string; staleBearer: boolean; anyBearer: boolean }[] = [];
  tab2.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    const authorization = request.headers()['authorization'] ?? null;
    tab2Api.push({ path: `${request.method()} ${url.pathname}`, staleBearer: authorization === `Bearer ${token}`, anyBearer: authorization !== null });
  });

  // When: Cerrar sesión en la pestaña 1 (flujo normal, ESC-38).
  await tab1.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(tab1).toHaveURL(/\/login$/);
  expect(await readStoredSession(tab1)).toBeNull();

  // Then: la pestaña 2 recibió un evento `storage` REAL del navegador para la clave de la sesión.
  await expect
    .poll(() => tab2.evaluate(() => (window as unknown as QaWindow).__qaStorageEvents.length), { message: 'evento storage en la pestaña 2' })
    .toBeGreaterThanOrEqual(1);
  const events = await tab2.evaluate(() => (window as unknown as QaWindow).__qaStorageEvents);
  expect(events).toEqual([
    { key: SESSION_STORAGE_KEY, hadOldValue: true, newValue: null, sameArea: true, fromOrigin: new URL(tab1.url()).origin },
  ]);

  // D1: al recibir el evento no navega. La memoria se invalida sin esperar a la expiración. No adopta ni reescribe.
  expect.soft(tab2.url(), 'D1: sin navegación al recibir el evento').toMatch(/\/dashboard$/);
  // Los listeners de `storage` de la página (el de QA, instalado antes, y el de la app) corren en el mismo despacho
  // del evento: tras observarlo, la memoria ya debe estar invalidada.
  expect.soft(await memoryHolds(tab2, token), 'token anterior descartado de la memoria').toBeNull();
  expect.soft(await readStoredSession(tab2), 'la clave sigue ausente').toBeNull();
  expect.soft(await tab2.evaluate(() => [...(window as unknown as QaWindow).__qaWrites]), 'la pestaña 2 no escribe').toEqual([]);

  // Siguiente petición protegida con el cliente real de la app: no sale con el token anterior y lleva a /login.
  const outcome = await tab2.evaluate(async (url) => {
    const client = await import(/* @vite-ignore */ url);
    try {
      await client.apiRequest('/products', { auth: true });
      return 'ok';
    } catch (error) {
      return (error as Error).name;
    }
  }, CLIENT_MODULE);
  expect.soft(outcome, 'petición protegida').toBe('NoSessionError');
  expect.soft(tab2Api.filter((r) => r.staleBearer).map((r) => r.path), 'peticiones con el token anterior').toEqual([]);
  expect.soft(tab2Api.filter((r) => r.anyBearer).map((r) => r.path), 'peticiones con algún Bearer').toEqual([]);

  await expect.soft(tab2, 'termina en /login').toHaveURL(/\/login$/);
  await expect.soft(emailField(tab2)).toBeVisible();
  await expect.soft(tab2.getByText(EXPIRED_NOTICE), 'sin aviso de sesión expirada').toHaveCount(0);

  // Al final: el almacenamiento compartido sigue sin sesión y la pestaña 2 no lo escribió en ningún momento.
  expect.soft(await readStoredSession(tab2)).toBeNull();
  expect.soft(await tab2.evaluate(() => [...(window as unknown as QaWindow).__qaWrites])).toEqual([]);
  expect.soft(await moduleLoads(tab2, STORE_MODULE), 'una sola instancia del almacén').toBe(1);
});
