import { createBrowserRouter, type RouteObject } from 'react-router';
import { setSessionLostHandler } from '../api/client';
import DashboardLayout from '../layouts/DashboardLayout';
import FallbackRedirect from './FallbackRedirect';
import { loginLoader, protectedLoader, unknownRouteLoader } from './loaders';
import { DASHBOARD_ROUTES, PUBLIC_ROUTES } from './routes';

const routeObjects: RouteObject[] = [
  ...PUBLIC_ROUTES.map(({ path, Component }) => ({
    path,
    Component,
    ...(path === '/login' ? { loader: loginLoader } : {}),
  })),
  {
    Component: DashboardLayout,
    loader: protectedLoader,
    // La sesión se vuelve a comprobar en cada navegación interna (DP-05), no solo al cargar la página.
    shouldRevalidate: () => true,
    children: DASHBOARD_ROUTES.map(({ path, Component }) => ({ path, Component })),
  },
  { path: '*', Component: FallbackRedirect, loader: unknownRouteLoader },
];

// Único punto de integración entre el cliente HTTP y la navegación (el cliente no importa el router).
// Se registra ANTES de crear el router: react-router ejecuta el loader inicial de forma síncrona dentro de
// createBrowserRouter, y ese loader marca la pérdida de sesión; registrar el manejador después la reiniciaría.
// El manejador solo se invoca tras la inicialización, así que puede referenciar `router`.
setSessionLostHandler(() => {
  void router.navigate('/login', { replace: true });
});

export const router = createBrowserRouter(routeObjects);
