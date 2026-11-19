import { createBrowserRouter, type RouteObject } from 'react-router';
import DashboardLayout from '../layouts/DashboardLayout';
import FallbackRedirect from './FallbackRedirect';
import { DASHBOARD_ROUTES, PUBLIC_ROUTES } from './routes';

const routeObjects: RouteObject[] = [
  ...PUBLIC_ROUTES.map(({ path, Component }) => ({ path, Component })),
  {
    Component: DashboardLayout,
    children: DASHBOARD_ROUTES.map(({ path, Component }) => ({ path, Component })),
  },
  { path: '*', Component: FallbackRedirect },
];

export const router = createBrowserRouter(routeObjects);
