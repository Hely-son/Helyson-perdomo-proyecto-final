import { DASHBOARD_ROUTES, FALLBACK_PATH, PUBLIC_ROUTES } from '../../src/routes/routes';
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

describe('QA-00.5-30 (ESC-49a): comportamiento provisional del destino de respaldo', () => {
  it('FALLBACK_PATH es /dashboard', () => {
    expect(FALLBACK_PATH).toBe('/dashboard');
  });

  it('el destino de respaldo es una ruta registrada, así que no hay bucle de redirección', () => {
    expect(registered).toContain(FALLBACK_PATH);
  });

  it.each(['/no-existe', '/dashboard/unknown', ...V2_PATHS])('%s no está registrada', (path) => {
    expect(registered).not.toContain(path);
  });
});
