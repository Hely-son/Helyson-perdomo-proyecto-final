import { DASHBOARD_ROUTES, PUBLIC_ROUTES } from '../../src/routes/routes';
import { DASHBOARD_MENU_ITEMS } from '../../src/routes/menu';

const registered = [...PUBLIC_ROUTES, ...DASHBOARD_ROUTES].map((r) => r.path as string);
const V2_PATHS = ['/dashboard/customers', '/dashboard/claims', '/dashboard/purchase-orders'];

describe('QA-00.5-29 (ESC-45): el dashboard solo expone rutas MVP', () => {
  it('las rutas del dashboard son exactamente /dashboard, /dashboard/products y /dashboard/orders', () => {
    expect(DASHBOARD_ROUTES.map((r) => r.path)).toEqual(['/dashboard', '/dashboard/products', '/dashboard/orders']);
  });

  it.each(V2_PATHS)('%s no está registrada', (path) => {
    expect(registered).not.toContain(path);
  });

  it('el menú contiene solo las rutas MVP y la entrada "Cerrar sesión" (sin afirmar si está habilitada), sin entradas V2', () => {
    const keys = DASHBOARD_MENU_ITEMS.flatMap((item) => (item && 'key' in item ? [String(item.key)] : []));
    expect(keys).toEqual(['/dashboard', '/dashboard/products', '/dashboard/orders', 'logout']);
    const labels = DASHBOARD_MENU_ITEMS.flatMap((item) =>
      item && 'label' in item ? [String(item.label).toLowerCase()] : [],
    );
    for (const v2 of ['clientes', 'reclamos', 'reposición', 'reposicion']) {
      expect(labels.some((l) => l.includes(v2))).toBe(false);
    }
  });
});

// QA-01.2-15 sustituye a QA-00.5-30 (TK-01.2): el destino de respaldo ya no es fijo, depende de la sesión (DP-07, ESC-49).
// Import dinámico: mientras src/auth no exista, solo falla este bloque y QA-00.5-29 sigue como regresión.
describe('QA-01.2-15 (ESC-49, DP-07): destino de respaldo según la sesión, sin bucles', () => {
  const NOW = Date.parse('2026-11-24T12:00:00.000Z');
  const valid = { token: 't', expiresAt: new Date(NOW + 60_000).toISOString(), operatorName: 'Op' };
  let resolveUnknownRoute: typeof import('../../src/auth/guards').resolveUnknownRoute;

  beforeAll(async () => {
    ({ resolveUnknownRoute } = await import('../../src/auth/guards'));
  });

  it('con sesión válida el respaldo es /dashboard; sin sesión, /login', () => {
    expect(resolveUnknownRoute(valid, NOW)).toBe('/dashboard');
    expect(resolveUnknownRoute(null, NOW)).toBe('/login');
  });

  it('ambos destinos de respaldo son rutas registradas, así que no hay bucle de redirección', () => {
    expect(registered).toContain(resolveUnknownRoute(valid, NOW));
    expect(registered).toContain(resolveUnknownRoute(null, NOW));
  });

  it.each(['/no-existe', '/dashboard/unknown', '/dashboard/inexistente', ...V2_PATHS])('%s no está registrada', (path) => {
    expect(registered).not.toContain(path);
  });
});
