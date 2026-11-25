import { createElement } from 'react';
import type { MenuProps } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { DASHBOARD_ROUTES, LOGOUT_MENU_KEY, LOGOUT_MENU_LABEL, type DashboardPath } from './routes';

type MenuItem = NonNullable<MenuProps['items']>[number];

/** Menú del dashboard derivado de DASHBOARD_ROUTES, más "Cerrar sesión". */
export const DASHBOARD_MENU_ITEMS: MenuItem[] = [
  ...DASHBOARD_ROUTES.map((route) => ({
    key: route.path,
    label: route.label,
    icon: createElement(route.icon),
  })),
  { type: 'divider' },
  {
    key: LOGOUT_MENU_KEY,
    label: LOGOUT_MENU_LABEL,
    icon: createElement(LogoutOutlined),
  },
];

/** Devuelve la ruta del dashboard que corresponde a una clave del menú, o null si no navega. */
export function dashboardPathFromMenuKey(key: string): DashboardPath | null {
  return DASHBOARD_ROUTES.find((route) => route.path === key)?.path ?? null;
}

/** Clave del menú seleccionada para una URL (ignora la barra final). */
export function selectedMenuKey(pathname: string): DashboardPath | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return dashboardPathFromMenuKey(normalized);
}
