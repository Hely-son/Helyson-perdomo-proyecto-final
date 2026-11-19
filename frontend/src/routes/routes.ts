// Configuración tipada de rutas y menú: fuente única (TK-00.2, docs/ARCHITECTURE.md "Frontend").
// El router y el menú del dashboard se derivan de aquí. Solo rutas MVP.
import type { ComponentType } from 'react';
import { HomeOutlined, MedicineBoxOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import ChatPage from '../pages/ChatPage';
import LoginPage from '../pages/LoginPage';
import DashboardHomePage from '../pages/DashboardHomePage';
import ProductsPage from '../pages/ProductsPage';
import OrdersPage from '../pages/OrdersPage';

export type PublicPath = '/chat' | '/login';
export type DashboardPath = '/dashboard' | '/dashboard/products' | '/dashboard/orders';

export interface PublicRoute {
  path: PublicPath;
  Component: ComponentType;
}

export interface DashboardRoute {
  path: DashboardPath;
  /** Etiqueta de la entrada del menú del dashboard. */
  label: string;
  icon: ComponentType;
  Component: ComponentType;
}

/** Rutas fuera del layout del dashboard. */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: '/chat', Component: ChatPage },
  { path: '/login', Component: LoginPage },
];

/** Rutas dentro del layout del dashboard, en el orden del menú. */
export const DASHBOARD_ROUTES: readonly DashboardRoute[] = [
  { path: '/dashboard', label: 'Inicio', icon: HomeOutlined, Component: DashboardHomePage },
  { path: '/dashboard/products', label: 'Productos', icon: MedicineBoxOutlined, Component: ProductsPage },
  { path: '/dashboard/orders', label: 'Pedidos', icon: ShoppingCartOutlined, Component: OrdersPage },
];

/** Destino de '/' y de cualquier ruta desconocida. */
export const FALLBACK_PATH: DashboardPath = '/dashboard';

/** Clave de la entrada "Cerrar sesión" del menú: deshabilitada, no navega. */
export const LOGOUT_MENU_KEY = 'logout';
export const LOGOUT_MENU_LABEL = 'Cerrar sesión';
